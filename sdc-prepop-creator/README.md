# FHIR Question Answering

Set up env vars:

```
cp .env.template .env
vim .env
```

Now run the dialog script:

    deno run --allow-read --allow-write  --allow-env --allow-net dialog.ts "https://qforms-server.azurewebsites.net/Questionnaire/cvd-risk"


## Logical processing for the script
* Read Questionnaire Definition
* If there is no description, generate one using GPT
    * trim out all the non descriptive properties to reduce size of the content, and pass that in YAML through
* Scan through all the questions (items)
* for each question
    * ask GPT to create a fhir query to read the value into a variable (to define in the item)
        - consider if it is a repeating item (and ask for all or one)
    * ask GPT to create a fhir expression to read the value from the variable
* rescan the questionnaire to move any common extract variables to their parent
 
## Simplified Prompt Templates
// create a fhir query to read Systolic Blood Pressure Observations
const query = "[insert]"

// create a fhirpath expression to read the Systolic Blood Pressure from a fhir Observation
const expr = "[insert]"

