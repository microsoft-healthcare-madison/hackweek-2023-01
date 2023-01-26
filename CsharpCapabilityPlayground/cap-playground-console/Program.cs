// <copyright file="Program.cs" company="Microsoft Corporation">
//     Copyright (c) Microsoft Corporation. All rights reserved.
//     Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// </copyright>

extern alias fhir4sdk;
extern alias fhir4Bsdk;
extern alias fhir5sdk;

using Microsoft.Extensions.Configuration;
using OpenAI.GPT3;
using OpenAI.GPT3.Managers;
using OpenAI.GPT3.ObjectModels;
using OpenAI.GPT3.ObjectModels.RequestModels;
using OpenAI.GPT3.ObjectModels.ResponseModels;
using OpenAI.GPT3.ObjectModels.SharedModels;
using System.CommandLine;
using fhir = Hl7.Fhir.Model;
using fhir4 = fhir4sdk::Hl7.Fhir.Model;
using fhir4B = fhir4Bsdk::Hl7.Fhir.Model;
using fhir5 = fhir5sdk::Hl7.Fhir.Model;

namespace cap_playground_console;

public static class Program
{
    /// <summary>The configuration.</summary>
    private static IConfiguration _config;

    private static fhir4sdk::Hl7.Fhir.Serialization.FhirJsonParser _parser4 = new(new Hl7.Fhir.Serialization.ParserSettings()
    {
        AcceptUnknownMembers = true,
        AllowUnrecognizedEnums = true,
        PermissiveParsing = true,
    });

    private static fhir4sdk::Hl7.Fhir.Serialization.FhirJsonSerializer _serializer4 = new(new Hl7.Fhir.Serialization.SerializerSettings()
    {
        AppendNewLine = false,
        Pretty = false,
        TrimWhiteSpacesInXml = true,
    });

    private static fhir4Bsdk::Hl7.Fhir.Serialization.FhirJsonParser _parser4B = new(new Hl7.Fhir.Serialization.ParserSettings()
    {
        AcceptUnknownMembers = true,
        AllowUnrecognizedEnums = true,
        PermissiveParsing = true,
    });

    private static fhir4Bsdk::Hl7.Fhir.Serialization.FhirJsonSerializer _serializer4B = new(new Hl7.Fhir.Serialization.SerializerSettings()
    {
        AppendNewLine = false,
        Pretty = false,
        TrimWhiteSpacesInXml = true,
    });


    /// <summary>Main entry-point for this application.</summary>
    /// <param name="args">An array of command-line argument strings.</param>
    /// <returns>
    /// An asynchronous result that yields exit-code for the process - 0 for success, else an error
    /// code.
    /// </returns>
    public static async Task<int> Main(string[] args)
    {
        Option<string> fhirVersionOption = new Option<string>(
            new[] { "--fhir-version", "-v" },
            "The FHIR version (default: R4)");

        Option<FileInfo?> fileOption = new Option<FileInfo?>(
            new[] { "--file", "-f" },
            "A local FHIR CapabilityStatement file to process.");

        Option<Uri?> urlOption = new Option<Uri?>(
            new[] { "--url", "-u" },
            "A URL to a FHIR CapabilityStatement to process.");

        // setup our configuration (environment > appsettings.json)
        _config = new ConfigurationBuilder()
            .AddJsonFile("appsettings.json", optional: true)
            .AddEnvironmentVariables()
            .Build()
            ;

        if (string.IsNullOrEmpty(_config["OPEN_AI_API_KEY"]))
        {
            Console.WriteLine("Missing OpenAI API Key (set in environment variable OPEN_AI_API_KEY)");
            return -1;
        }

        RootCommand rootCommand = new("Summarize a FHIR CapabilityStatement using ChatGPT");

        rootCommand.AddOption(fhirVersionOption);
        rootCommand.AddOption(fileOption);
        rootCommand.AddOption(urlOption);

        rootCommand.SetHandler((version, file, url) =>
            {
                if (file != null)
                {
                    Task.Run(() => ProcessFileRequest(file!, version)).Wait();
                }

                if (url != null)
                {
                    Task.Run(() => ProcessUrlRequest(url!, version)).Wait();
                }
            },
            fhirVersionOption, fileOption, urlOption);

        return await rootCommand.InvokeAsync(args);
    }

    /// <summary>Process the file request described by file.</summary>
    /// <param name="file">   The file.</param>
    /// <param name="version">The version.</param>
    /// <returns>An asynchronous result.</returns>
    private static async Task ProcessFileRequest(FileInfo file, string version)
    {
        if (!file.Exists)
        {
            Console.WriteLine($"File {file.FullName} does not exist.");
            return;
        }

        if (!file.Extension.Equals(".json", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"File {file.FullName} does not have the JSON extension.");
            return;
        }

        string contents = File.ReadAllText(file.FullName);

        if (string.IsNullOrEmpty(contents))
        {
            Console.WriteLine($"File {file.FullName} is empty!");
            return;
        }

        await ProcessJson(contents, version);
    }

    /// <summary>Process the URL request described by capUrl.</summary>
    /// <param name="capUrl"> URL of the capability.</param>
    /// <param name="version">The version.</param>
    /// <returns>An asynchronous result.</returns>
    private static async Task ProcessUrlRequest(Uri capUrl, string version)
    {
        try
        {
            HttpClient client = new();

            HttpRequestMessage request = new HttpRequestMessage(
                HttpMethod.Get,
                capUrl);

            request.Headers.Add("Accept", new string[] { "application/fhir+json", "application/json" });

            HttpResponseMessage response = await client.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine($"Url {capUrl.AbsoluteUri} returned status code {response.StatusCode}!");
                return;
            }

            string contents = await response.Content.ReadAsStringAsync();

            if (string.IsNullOrEmpty(contents))
            {
                Console.WriteLine($"Url {capUrl.AbsoluteUri} returned no contents!");
                return;
            }

            await ProcessJson(contents, version);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error processing URL {capUrl}: {ex.Message}");
            if (ex.InnerException != null)
            {
                Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
            }
        }
    }

    /// <summary>Process the JSON described by capabilityJson.</summary>
    /// <param name="capabilityJson">The capability JSON.</param>
    /// <param name="version">       The version.</param>
    /// <returns>An asynchronous result.</returns>
    private static async Task ProcessJson(string capabilityJson, string version)
    {
        try
        {
            fhir.CapabilityStatement caps;
            
            if (version.Equals("r4b", StringComparison.OrdinalIgnoreCase))
            {
                caps = _parser4B.Parse<fhir.CapabilityStatement>(capabilityJson);
            }
            else
            {
                caps = _parser4.Parse<fhir.CapabilityStatement>(capabilityJson);
            }

            await Process(caps, version);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error parsing CapabilityStatement JSON: {ex.Message}");
            if (ex.InnerException != null)
            {
                Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
            }
        }
    }

    /// <summary>Process the given CapabilityStatement.</summary>
    /// <param name="caps">The capabilities.</param>
    private static async Task Process(fhir.CapabilityStatement caps, string version)
    {
        // setup OpenAI access
        OpenAIService openAi = new(new OpenAiOptions()
        {
            ApiKey = _config["OPEN_AI_API_KEY"]!,
        });

        // make a copy of the capability statement without the rest section
        fhir.CapabilityStatement root = (fhir.CapabilityStatement)caps.DeepCopy();
        root.Text = null;
        root.Rest.Clear();

        List<string> summaryComponents = new();

        if (version.Equals("r4b", StringComparison.OrdinalIgnoreCase))
        {
            summaryComponents.Add(await Summarize(openAi, PromptForRoot(_serializer4B.SerializeToString(root))));

            if (caps.Rest.Any())
            {
                foreach (fhir.CapabilityStatement.ResourceComponent resource in caps.Rest.First().Resource)
                {
                    summaryComponents.Add(await Summarize(openAi, PromptForResource(_serializer4B.SerializeToString(resource))));
                }
            }
        }
        else
        {
            summaryComponents.Add(await Summarize(openAi, PromptForRoot(_serializer4.SerializeToString(root))));

            if (caps.Rest.Any())
            {
                foreach (fhir.CapabilityStatement.ResourceComponent resource in caps.Rest.First().Resource)
                {
                    summaryComponents.Add(await Summarize(openAi, PromptForResource(_serializer4.SerializeToString(resource))));
                }
            }
        }

        Console.WriteLine($"""
Summary of the CapabilityStatment:
---------------------------------------------------
{string.Join('\n', summaryComponents)}
---------------------------------------------------
""");
    }

    /// <summary>Prompt for root.</summary>
    /// <param name="json">The JSON.</param>
    /// <returns>A string.</returns>
    private static string PromptForRoot(string json)
    {
        return $"""
Summarize the following FHIR CapabilityStatement
- Jurisdiction 001 from UNSD M49 is called the 'universal realm'
- Include the URL for this resource
{json}
""";
    }

    /// <summary>Prompt for resource.</summary>
    /// <param name="json">The JSON.</param>
    /// <returns>A string.</returns>
    private static string PromptForResource(string json)
    {
        return $"""
Summarize the following FHIR content
- Include conformance expectations if and only if specified by capabilitystatement-expectation
- Add a bullet-list of profiles
- Create markdown tables for interactions, operations, search parameters, operations with conformance expectations and links to definitions
{json}
""";
    }

    private static async Task<string> Summarize(OpenAIService openAi, string prompt)
    {
        try
        {
            CompletionCreateResponse completionResult = await openAi.Completions.CreateCompletion(new CompletionCreateRequest()
            {
                Prompt = prompt,
                Model = Models.TextDavinciV3,
                Temperature = 0.1f,
                MaxTokens = 512,
            });

            if (!completionResult.Successful)
            {
                Console.WriteLine("No completion result returned");
                return string.Empty;
            }

            if (!completionResult.Choices.Any())
            {
                Console.WriteLine($"No choices in completion result");
                return string.Empty;
            }

            ChoiceResponse resp = completionResult.Choices.First();

            Console.WriteLine($"Request finished with reason: {resp.FinishReason} ({completionResult.Usage.TotalTokens} tokens)");

            string value = resp.Text;
            return value;
        }
        catch(Exception ex)
        {
            Console.WriteLine($"Error during summarization: {ex.Message}");
            if (ex.InnerException != null)
            {
                Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
            }

            throw;
        }

    }
}