const { SESClient } = require("@aws-sdk/client-ses");

exports.entry = async function (event, context) {
  const client = new SESClient({ region: "eu-central-1" });
  const input = {
    Source: "accounts@llun.social",
    Destination: {
      ToAddresses: ["social-test@llun.dev"],
    },
    Message: {
      Subject: {
        Data: "Account verification email",
      },
      Body: {
        Text: {
          Data: "This is a test email",
        },
        Html: {
          Data: "<strong>This</strong> is a test email",
        },
      },
    },
    ReplyToAddresses: ["accounts@llun.social"],
    ConfigurationSetName: "transaction-emails",
  };
  const command = new SendEmailCommand(input);
  const response = await client.send(command);

  console.log("EVENT: \n" + JSON.stringify(response, null, 2));
  return context.logStreamName;
};
