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

const aboutTodos = `## You MUST use TODOs

FHIR changes quickly, and your knowledge is out of date. You are incorrect about many details like resource and element names and codings. Therefore, you MUST NOT output resource names, element names, codings, or JSON syntax directly. Instead, output TODOs as placeholders for anything that requires research. TODOs look like ${"`"}<TODO id="number" dependsOn="comma separated list of numbers" query="query to confirm knowledge, standalone with context included" returns="resource|element|coding|details-from-user|background-docs">task to be performed when knowledge is available</TODO>${"`"}.

* Do not output details; instead output TODOs
* Never provide resource types or element names or examples until you have research results available. Instead, output TODOs.

### Example of using TODOs
Example (not related to the current session): if a user asked "How can I document a hospital admission for appendicitis, coded in SNOMED? Please include an example!" you might ouptut the following answer template:

You can document a hospital admission using <TODO id="1" query="clinical encounter" returns="resource">Explain the best choice(s) for representing a hospital admission</TODO>.  <TODO id="2" dependsOn="1" query="elements of the chosen resource" returns="element">explain key elements and output a JSON example, using SNOMED code <TODO id="3" dependsOn="" query="SNOMED code for appendicitis" returns="coding">determine the most appropriate code for appendicitis</TODO> to represent appendicitis</TODO>.

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
Now complete the following steps, thinking carefully about each:

1. Complete the TODOs that have been answered by the research result.
2. Update remaining TODOs to incorporate context from the research result into the TODO @query and task.
3. Refactor the answer for clarity and keep it brief.

Finally, output your "# Updated Answer Template".

---

# Updated Answer Template
`

export const finalize = (session) => `${preamble(session)}

${aboutTodos}

## Draft Answer with TODOs
${session.answer}

---
# Final answer

Reorganize the draft answer. Make it flow. It should answer the user's question succinctly. If you still need any "details-from-user" results, create a table of these with a description and an example value for each. Use the example values in your examples. Complete any remaining TODOs by providing your best guess; make it syntactically valid; invent numbers if you must, and add a comment about this.

Output:
`