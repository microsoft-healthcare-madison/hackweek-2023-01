const preamble = (session) => `# Context
## Standards
* FHIR for clinical data
  * LOINC for cbservations
  * SNOMED for conditions, provider types
  * RXNORM for medications

## Today's Date
${session.date || new Date().toISOString().slice(0, 10)}

## Top-line User Question
${session.userQuestion}
`

const aboutTodos = `## Using TODOs

FHIR changes quickly, and your knowledge is out of date. You are incorrect about many details like resource and element names and codings. Therefore, you MUST NOT output resource names, element names, codings, or JSON syntax without a TODO. TODOs are placeholders for anything that requires research. TODOs look like ${"`"}<TODO id="number" dependsOn="comma separated list of numbers" query="query to confirm knowledge, standalone with context included" returns="resource|element|coding|details-from-user|background-docs">description of content to output when query results are available</TODO>${"`"}.

* Do not output details; instead output TODOs
* Never provide resource types or element names or examples until you have research results available. Instead, output TODOs.
* Never output JSON; first, output a TODO with result="element" to learn about the resource's elements.
* Never write multiple TODOs to find Coding (.system vs .code vs .display); always write a single TODO to query for the whole Coding.

### Example of using TODOs
Example (not related to the current session): if a user asked "How can I document a hospital admission for appendicitis, coded in SNOMED? Please include an example!" you might output the following answer template:

<TODO id="1" dependsOn="" query="clinical encounter" returns="resource">Explain the best resource choice(s) for representing a hospital admission</TODO>. <TODO id="2" dependsOn="1,3" query="elements of the chosen resource" returns="element">Outline key elements and output a JSON example, using SNOMED code <TODO id="3" dependsOn="" query="SNOMED code for appendicitis" returns="coding">determine the most appropriate code for appendicitis</TODO> to represent appendicitis</TODO>.

`

export const initialize = (session) => `${preamble(session)}

${aboutTodos}

--

Now output an answer template for the user's question.  

# Answer Template with TODOs for any data that needs research
`

export const refine = (session) => `${preamble(session)}

${aboutTodos}

## Previous Answer Template
${session.answer}

## Research Results
Note: results may have extraneous information. Ignore anything you don't need.
${session.results.map(r => `<result query="${r.query}">${r.result}</result>`)}

--
Now output your "# Updated Answer Template". Eliminate any TODOs that exactly match the Research Results. Rewrite other TODOs to update their @dependsOn= @query= and task description, based on the Research Results. Stay vigilent about your imperfect knowledge. Use TODOs instead of mentioning any resource, element, or coding. TODOs are the only reliable way to get information about resources, elements, and codings. Without TODOs you will make mistakes and the user will be disappointed.

# Updated Answer Template with more TODOs

`

export const finalize = (session) => `${preamble(session)}

${aboutTodos}

## Draft Answer with TODOs
${session.answer}

---
# Final answer

Reorganize the draft answer. Make it flow. It should answer the user's question succinctly. If you have any remaining TODOs, create a table of these with a description and generate a best-guess example value for each. Complete any remaining TODOs based on your table of examples. They should be syntactically valid; invent numbers and other details if you must.

Output:
`