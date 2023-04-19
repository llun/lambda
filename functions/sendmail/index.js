// @ts-check
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

/**
 * @typedef {{ from: string, to: string[], replyTo?: string, subject: string, content: { text: string, html: string }, configurationSet?: 'transaction-emails' }} Event
 */

/**
 *
 * @param {Event} event
 * @param {import('aws-lambda').Context} context
 *
 * @returns
 */
exports.entry = async function (event, context) {
  const client = new SESClient({ region: "eu-central-1" });
  const input = {
    Source: event.from,
    Destination: {
      ToAddresses: event.to,
    },
    Message: {
      Subject: {
        Data: event.subject,
      },
      Body: {
        Text: {
          Data: event.content.text,
        },
        Html: {
          Data: event.content.html,
        },
      },
    },
    ...(event.replyTo && { ReplyToAddresses: [event.replyTo] }),
    ...(event.configurationSet && {
      ConfigurationSetName: event.configurationSet,
    }),
  };
  const command = new SendEmailCommand(input);
  const response = await client.send(command);

  console.log("EVENT: \n" + JSON.stringify(response, null, 2));
  return context.logStreamName;
};
