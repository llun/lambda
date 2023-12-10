#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
// @ts-check
require("dotenv-flow/config");
const {
  CloudFormationClient,
  DescribeStacksCommand,
  CreateStackCommand,
  UpdateStackCommand,
} = require("@aws-sdk/client-cloudformation");

const StackName = "ActivityPub";
const ActivityNext = "ActivityNext";
const StaticBucket = "ActivityNextStatic";
const StaticBucketDomain = "static.llun.social";

const staticS3Resources = {
  [StaticBucket]: {
    Type: "AWS::S3::Bucket",
    Properties: {
      BucketName: StaticBucketDomain,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: false,
        BlockPublicPolicy: false,
        IgnorePublicAcls: false,
        RestrictPublicBuckets: false,
      },
      WebsiteConfiguration: {
        IndexDocument: "index.html",
        ErrorDocument: "404.html",
      },
    },
  },
  [`${StaticBucket}Policy`]: {
    Type: "AWS::S3::BucketPolicy",
    Properties: {
      Bucket: { Ref: StaticBucket },
      PolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "PublicReadGetObject",
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: {
              "Fn::Join": ["", ["arn:aws:s3:::", { Ref: StaticBucket }, "/*"]],
            },
          },
        ],
      },
    },
  },
};

const cdnResources = {
  [`${ActivityNext}CachePolicy`]: {
    Type: "AWS::CloudFront::CachePolicy",
    Properties: {
      CachePolicyConfig: {
        Comment: `Cache policy for ${ActivityNext}`,
        DefaultTTL: 86400,
        MaxTTL: 31536000,
        MinTTL: 1,
        Name: `${ActivityNext}CachePolicy`,
        ParametersInCacheKeyAndForwardedToOrigin: {
          CookiesConfig: {
            CookieBehavior: "none",
          },
          EnableAcceptEncodingBrotli: true,
          EnableAcceptEncodingGzip: true,
          HeadersConfig: {
            HeaderBehavior: "whitelist",
            Headers: ["Host", "Origin"],
          },
          QueryStringsConfig: {
            QueryStringBehavior: "none",
          },
        },
      },
    },
  },
  [`${ActivityNext}OriginRequestPolicy`]: {
    Type: "AWS::CloudFront::OriginRequestPolicy",
    Properties: {
      OriginRequestPolicyConfig: {
        Comment: `Origin request policy for ${ActivityNext}`,
        CookiesConfig: {
          CookieBehavior: "none",
        },
        HeadersConfig: {
          HeaderBehavior: "whitelist",
          Headers: ["Host"],
        },
        Name: `${ActivityNext}OriginRequestPolicy`,
        QueryStringsConfig: {
          QueryStringBehavior: "none",
        },
      },
    },
  },
  [`${ActivityNext}CDN`]: {
    Type: "AWS::CloudFront::Distribution",
    Properties: {
      DistributionConfig: {
        Aliases: [StaticBucketDomain],
        Origins: [
          {
            DomainName: `${StaticBucketDomain}.s3.eu-central-1.amazonaws.com`,
            Id: `${StaticBucket}Origin`,
            S3OriginConfig: {
              OriginAccessIdentity: "",
            },
          },
        ],
        Enabled: true,
        HttpVersion: "http2and3",
        Comment: "Activities.next Content",
        DefaultRootObject: "index.html",
        PriceClass: "PriceClass_All",
        IPV6Enabled: true,
        DefaultCacheBehavior: {
          TargetOriginId: `${StaticBucket}Origin`,
          CachePolicyId: {
            Ref: `${ActivityNext}CachePolicy`,
          },
          OriginRequestPolicyId: {
            Ref: `${ActivityNext}OriginRequestPolicy`,
          },
          Compress: true,
          ViewerProtocolPolicy: "redirect-to-https",
        },
        ViewerCertificate: {
          AcmCertificateArn:
            "arn:aws:acm:us-east-1:107563078874:certificate/de964534-d6e8-49ae-bca2-656c4fef49ce",
          SslSupportMethod: "sni-only",
          MinimumProtocolVersion: "TLSv1.2_2021",
        },
        Logging: {
          Bucket: "llun.logs.s3.amazonaws.com",
          Prefix: "cloudfront/llun.social",
        },
      },
    },
  },
};

const template = {
  AWSTemplateFormatVersion: "2010-09-09",
  Description: "Activities.next storage and CDN",
  Mappings: {
    RegionToS3DomainSuffix: {
      "eu-central-1": {
        suffix: "s3-website.eu-central-1.amazonaws.com",
      },
    },
  },
  Resources: {
    ...staticS3Resources,
    ...cdnResources,
  },
};

const cloudformation = new CloudFormationClient({ region: "eu-central-1" });

async function run() {
  try {
    await cloudformation.send(new DescribeStacksCommand({ StackName }));
    console.log("Updating stack");
    await cloudformation.send(
      new UpdateStackCommand({
        StackName,
        TemplateBody: JSON.stringify(template),
      })
    );
  } catch (error) {
    if (!error.message.endsWith("does not exist")) {
      throw error;
    }

    console.log("Creating new stack");
    await cloudformation.send(
      new CreateStackCommand({
        StackName,
        TemplateBody: JSON.stringify(template),
      })
    );
  }
}

run()
  .then(() => {
    console.log("Finished");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error.message);
    console.error(error.stack);
    process.exit(-1);
  });
