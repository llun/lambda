// @ts-check
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const { z } = require("zod");

const Email = z.union([
  z.string().email({ message: "Invalid email address" }),
  z
    .object({
      name: z.string().regex(/[\w ]+/, "Invalid email name"),
      email: z.string().email({ message: "Invalid email address" }),
    })
    .transform((val) => `"${val.name}" <${val.email}>`),
]);

const Event = z
  .object({
    from: Email,
    to: Email.array(),
    replyTo: Email.optional(),
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
