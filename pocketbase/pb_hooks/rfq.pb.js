/// <reference path="../pb_data/types.d.ts" />

// Spam trap: bots fill the hidden "website" field, people never see it.
onRecordCreateRequest((e) => {
  if (e.record.get("website")) {
    throw new BadRequestError("Invalid submission.");
  }
  e.next();
}, "rfq");

// Email the brief to Taotus. A mail failure must never lose the lead, which is
// already saved by the time this runs.
onRecordCreateRequest((e) => {
  e.next();

  try {
    const to = $os.getenv("RFQ_NOTIFY_TO") || "info@taotus.com";
    const r = e.record;
    const oneLine = (s) => String(s || "").replace(/[\r\n]+/g, " ").trim();
    const field = (label, key) => `${label}: ${oneLine(r.get(key)) || "-"}`;

    const body = [
      "A new RFQ was submitted on taotus.com.",
      "",
      field("Level of support", "service"),
      field("Product or material", "product"),
      field("Quantity & unit", "quantity"),
      field("Destination", "destination"),
      field("Target timing", "timing"),
      field("Preferred payment method", "payment"),
      "",
      "Specifications & requirements:",
      String(r.get("specifications")),
      "",
      field("Name", "name"),
      field("Company", "company"),
      field("Email", "email"),
      "",
      "Reply to this email to answer the buyer directly.",
    ].join("\n");

    const message = new MailerMessage({
      from: {
        address: e.app.settings().meta.senderAddress,
        name: e.app.settings().meta.senderName,
      },
      to: [{ address: to }],
      subject: oneLine(`New RFQ - ${r.get("service")} - ${r.get("product")} - ${r.get("company")}`).slice(0, 200),
      text: body,
      headers: { "Reply-To": oneLine(r.get("email")) },
    });

    e.app.newMailClient().send(message);
  } catch (err) {
    console.log("RFQ notification email failed:", err);
  }
}, "rfq");
