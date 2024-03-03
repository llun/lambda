const {
  CloudFrontClient,
  UpdateDistributionCommand,
  GetDistributionConfigCommand,
} = require("@aws-sdk/client-cloudfront");

const DISTRIBUTIONS = ["E8PBHKRKQ6RKI", "E2F19B9UCBX0DS"];
const client = new CloudFrontClient({ region: "us-east-1" });

exports.entry = async function (event) {
  if (!("Records" in event)) return false;

  const exceeded = event.Records.find((record) => {
    return record.Sns.Subject.includes("has exceeded your alert threshold");
  });
  if (!exceeded) return false;

  await Promise.all(
    DISTRIBUTIONS.map(async (distribution) => {
      const { DistributionConfig: previousConfig, ETag } = await client.send(
        new GetDistributionConfigCommand({
          Id: distribution,
        })
      );
      const command = new UpdateDistributionCommand({
        Id: distribution,
        DistributionConfig: {
          ...previousConfig,
          Enabled: false,
        },
        IfMatch: ETag,
      });
      await client.send(command);
    })
  );

  return true;
};
