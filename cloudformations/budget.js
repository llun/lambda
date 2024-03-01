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

const StackName = "Budget";

const template = {
  AWSTemplateFormatVersion: "2010-09-09",
  Description: "Budget automation",

  Resources: {
    BudgetSNSTopic: {
      Type: "AWS::SNS::Topic",
      Properties: {
        TopicName: "BudgetSNS",
      },
    },
    BudgetSNSPolicy: {
      Type: "AWS::SNS::TopicPolicy",
      Properties: {
        PolicyDocument: {
          Statement: [
            {
              Sid: "AWSBudgets-notification-1",
              Effect: "Allow",
              Principal: {
                Service: "budgets.amazonaws.com",
              },
              Action: "SNS:Publish",
              Resource: { Ref: "BudgetSNSTopic" },
            },
          ],
        },
        Topics: [{ Ref: "BudgetSNSTopic" }],
      },
    },
    BudgetSubscription: {
      Type: "AWS::SNS::Subscription",
      Properties: {
        Endpoint:
          "arn:aws:lambda:eu-central-1:107563078874:function:Lambda_Collection_budget",
        Protocol: "lambda",
        TopicArn: { Ref: "BudgetSNSTopic" },
      },
    },
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
