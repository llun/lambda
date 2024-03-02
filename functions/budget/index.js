exports.entry = async function (event, context) {
  if (!("Records" in event)) return false;

  const records = event.Records.filter(
    (record) => record.EventSource === "aws:sns"
  );
  const exceeded = event.Records.find((record) => {
    return record.Sns.Subject.includes("has exceeded your alert threshold");
  });
  if (!exceeded) return false;

  return true;
};
