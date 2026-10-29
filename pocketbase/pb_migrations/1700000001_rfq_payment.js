/// <reference path="../pb_data/types.d.ts" />

// The form now asks for a preferred payment method instead of an indicative
// budget. The old "budget" field stays so earlier submissions keep their data.
migrate(
  (app) => {
    const rfq = app.findCollectionByNameOrId("rfq");
    rfq.fields.add(new TextField({ name: "payment", max: 200 }));
    app.save(rfq);
  },
  (app) => {
    const rfq = app.findCollectionByNameOrId("rfq");
    rfq.fields.removeByName("payment");
    app.save(rfq);
  }
);
