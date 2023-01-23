# Zulip FAQ Creator

First, set up env var:

```
cp .env.template .env
vim .env
```

Now run the FAQ creator with a Zulip topic URL. For example:

```sh
deno run --allow-net --allow-env --allow-read topic.ts "https://chat.fhir.org/#narrow/stream/179166-implementers/topic/Timing.2Erepeat.2Ewhen.20with.20a.20Meal.20clarification"

{
  "q": "How do I write a MedicationRequest to represent “Take with every meal” or “Take 30 minutes before every meal” concepts?",
  "a": "If there is an implicit “3 times/day”, then you can use the AC/PC/etc. codes, while if the patient has different meals per day the asNeededCodeableConcept with a code conveying “with meals” should be used.",
  "importance": 85
}
```



