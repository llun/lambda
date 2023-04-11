const { SESClient } = require("@aws-sdk/client-ses");

exports.entry = async function (event, context) {
  const client = new SESClient({ region: "eu-central-1" });

  console.log("EVENT: \n" + JSON.stringify(event, null, 2));
  return context.logStreamName;
};
