// @ts-check
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const { z } = require("zod");

const Event = z
  .object({
    from: z.string().email({ message: "Invalid from address" }),
    to: z.array(z.string().email({ message: "Invalid to address" })),
    replyTo: z
      .string()
      .email({ message: "Invalid reply to address" })
      .optional(),
    subject: z.string(),
    content: z.object({
      text: z.string(),
      html: z.string(),
    }),
    configurationSet: z.literal("transaction-emails").optional(),
  })
  .transform((event) => ({
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
  }));

/**
 *
 * @param {z.infer<typeof Event>} event
 * @param {import('aws-lambda').Context} context
 *
 * @returns
 */
exports.entry = async function (event, context) {
  const client = new SESClient({ region: "eu-central-1" });

  const input = Event.parse(event);
  const command = new SendEmailCommand(input);
  const response = await client.send(command);

  console.log("EVENT: \n" + JSON.stringify(response, null, 2));
  return context.logStreamName;
};
