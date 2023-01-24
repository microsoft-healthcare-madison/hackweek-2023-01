# FHIR Question Answering

Setup:

    curl https://raw.githubusercontent.com/smart-on-fhir/generated-sample-data/master/R4/SYNTHEA/Jill_Tillman_c4b7d178-c437-4202-9fb0-1b64afb8bc09.json > synthea_jill.json

Then, set up env vars:

```
cp .env.template .env
vim .env
```

Now run the dialog script:

    MAX_RESOURCES=2 deno run --allow-read --allow-write  --allow-env --allow-net dialog.ts "Do I have any nose problems?"
