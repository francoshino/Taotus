/// <reference path="../pb_data/types.d.ts" />

// RFQ submissions: the public may create, only superusers may read or change.
migrate(
  (app) => {
    const rfq = new Collection({
      type: "base",
      name: "rfq",
      listRule: null,
      viewRule: null,
      updateRule: null,
      deleteRule: null,
      createRule: "",
      fields: [
        { type: "select", name: "service", required: true, maxSelect: 1, values: ["connect", "source", "deliver", "unsure"] },
        { type: "text", name: "product", required: true, max: 180 },
        { type: "text", name: "specifications", required: true, max: 5000 },
        { type: "text", name: "quantity", required: true, max: 100 },
        { type: "text", name: "destination", required: true, max: 150 },
        { type: "text", name: "timing", max: 100 },
        { type: "text", name: "budget", max: 100 },
        { type: "text", name: "name", required: true, max: 100 },
        { type: "text", name: "company", required: true, max: 150 },
        { type: "email", name: "email", required: true },
        // Honeypot: real visitors never see it; the hook rejects anything filled in.
        { type: "text", name: "website", max: 200 },
        { type: "autodate", name: "created", onCreate: true },
      ],
    });
    app.save(rfq);

    // SMTP via Spacemail. The password is set in the admin UI, never in the repo.
    const settings = app.settings();
    settings.meta.appName = "Taotus";
    settings.meta.appURL = "https://taotus.com";
    settings.meta.senderName = "Taotus";
    settings.meta.senderAddress = "info@taotus.com";
    settings.smtp.enabled = true;
    settings.smtp.host = "mail.spacemail.com";
    settings.smtp.port = 465;
    settings.smtp.tls = true;
    settings.smtp.username = "info@taotus.com";
    app.save(settings);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("rfq"));
  }
);
