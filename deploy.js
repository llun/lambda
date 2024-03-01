#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
// @ts-check
/**
 * @typedef {{ awsid: string }} Arguments
 * @typedef {{ name: string, description: string, memory: number, timeout: number, role: string, handler: string, runtime: string, environment: Object | null | undefined }} ProjectConfig
 */
require("dotenv-flow/config");
const fs = require("fs");
const path = require("path");
const {
  LambdaClient,
  GetFunctionConfigurationCommand,
  UpdateFunctionConfigurationCommand,
  UpdateFunctionCodeCommand,
  PublishVersionCommand,
  UpdateAliasCommand,
  CreateFunctionCommand,
  CreateAliasCommand,
  waitUntilFunctionUpdated,
  waitUntilFunctionActive,
} = require("@aws-sdk/client-lambda");
const archiver = require("archiver");
const streamBuffers = require("stream-buffers");
const crypto = require("crypto");
const _ = require("lodash");

const FRANKFURT = "eu-central-1";

const projectConfig = /** @type {ProjectConfig} */ (
  JSON.parse(
    fs
      .readFileSync(path.join(__dirname, "project.json"), { encoding: "utf-8" })
      .toString()
  )
);

/**
 *
 * @param {string} functionName
 * @returns {Promise<[string, Buffer | null]>}
 */
async function archivingFunction(functionName) {
  const name = `${projectConfig.name}_${functionName}`;
  return new Promise((resolve, reject) => {
    console.log(`> Creating ${name} archive`);
    const buffers = new streamBuffers.WritableStreamBuffer({
      initialSize: 100 * 1024, // start at 100 kilobytes.
      incrementAmount: 10 * 1024, // grow by 10 kilobytes each time buffer overflows.
    });

    const archive = archiver("zip", { zlib: { level: -1 } });
    archive.on("error", (error) => reject(error));
    archive.pipe(buffers);

    buffers.on("finish", () => {
      const content = buffers.getContents();
      if (!content) {
        return resolve(["", null]);
      }

      const hash = crypto.createHash("sha256");
      hash.update(content);
      const digest = hash.digest("base64");
      resolve([digest, content]);
    });

    archive.directory(path.join(__dirname, "functions", functionName), false);
    archive.finalize();
  });
}

/**
 *
 * @param {LambdaClient} lambda
 * @param {string} functionName
 */
async function waitUpdate(lambda, functionName) {
  await waitUntilFunctionUpdated(
    { client: lambda, maxWaitTime: 10 },
    {
      FunctionName: functionName,
    }
  );
}

/**
 *
 * @param {LambdaClient} lambda
 * @param {string} functionName
 */
async function waitActive(lambda, functionName) {
  await waitUntilFunctionActive(
    { client: lambda, maxWaitTime: 30 },
    {
      FunctionName: functionName,
    }
  );
}

/**
 *
 * @param {string} functionName
 * @returns {ProjectConfig}
 */
function getFunctionConfig(functionName) {
  try {
    const base = projectConfig;
    const functionConfigPath = path.join(
      __dirname,
      "functions",
      functionName,
      "project.json"
    );
    if (!fs.existsSync(functionConfigPath)) {
      return base;
    }
    const functionConfig = JSON.parse(
      fs.readFileSync(functionConfigPath).toString("utf-8")
    );
    return { ...base, ...functionConfig };
  } catch {
    return projectConfig;
  }
}

/**
 *
 * @param {string} functionName
 * @returns {Promise<string | undefined>}
 */
async function deploy(functionName) {
  const name = `${projectConfig.name}_${functionName}`;
  const lambda = new LambdaClient({ region: FRANKFURT });

  let shouldPublishVersion = false;
  /** @type {string | undefined} */
  let version;

  console.log(`> Loading ${name} configuration`);
  try {
    const configuration = await lambda.send(
      new GetFunctionConfigurationCommand({
        FunctionName: name,
        Qualifier: "current",
      })
    );

    const current = {
      memory: configuration.MemorySize,
      timeout: configuration.Timeout,
      handler: configuration.Handler,
      runtime: configuration.Runtime,
      role: configuration.Role,
      environment:
        (configuration.Environment && configuration.Environment.Variables) ||
        {},
    };
    version = configuration.Version;

    const config = getFunctionConfig(functionName);
    const local = _.pick(config, [
      "memory",
      "timeout",
      "handler",
      "runtime",
      "environment",
      "role",
    ]);
    if (!_.isEqual(current, local)) {
      console.log(`> Updating ${name} configuration`);
      const params = {
        FunctionName: name,
        Handler: local.handler,
        MemorySize: local.memory,
        Runtime: local.runtime,
        Timeout: local.timeout,
        Role: local.role,
        Environment: {
          Variables: local.environment,
        },
      };
      await lambda.send(new UpdateFunctionConfigurationCommand(params));
      await waitUpdate(lambda, name);
      shouldPublishVersion = true;
    }

    const [digest, content] = await archivingFunction(functionName);
    if (!content) {
      throw new Error(`Fail to create ${functionName} archive`);
    }
    if (configuration.CodeSha256 !== digest) {
      console.log("> Updating function code");
      await lambda.send(
        new UpdateFunctionCodeCommand({
          FunctionName: name,
          ZipFile: content,
        })
      );
      await waitUpdate(lambda, name);
      shouldPublishVersion = true;
    }

    if (shouldPublishVersion) {
      console.log("> Publishing new version");
      const params = {
        CodeSha256: digest,
        FunctionName: name,
      };
      const latestVersion = await lambda.send(
        new PublishVersionCommand(params)
      );
      await waitUpdate(lambda, name);

      console.log(`> Move current alias to version ${latestVersion.Version}`);
      await lambda.send(
        new UpdateAliasCommand({
          FunctionName: name,
          FunctionVersion: latestVersion.Version,
          Name: "current",
        })
      );
      await waitUpdate(lambda, name);
      version = latestVersion.Version;
    }
  } catch (error) {
    if (error.name !== "ResourceNotFoundException") {
      throw error;
    }
    const [digest, content] = await archivingFunction(functionName);
    if (!content) {
      throw new Error(`Fail to create ${functionName} archive`);
    }
    console.log(`> Create new function ${name}`);
    const config = getFunctionConfig(functionName);
    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: name,
        Runtime: config.runtime,
        Handler: config.handler,
        Role: config.role,
        Timeout: config.timeout,
        Description: config.description,
        Code: {
          ZipFile: content,
        },
        MemorySize: config.memory,
      })
    );
    await waitActive(lambda, name);
    console.log("> Publishing new version");
    const latestVersion = await lambda.send(
      new PublishVersionCommand({
        CodeSha256: digest,
        FunctionName: name,
      })
    );
    await waitUpdate(lambda, name);
    console.log(`> Create current alias for version ${latestVersion.Version}`);
    await lambda.send(
      new CreateAliasCommand({
        FunctionName: name,
        FunctionVersion: latestVersion.Version || "$LATEST",
        Name: "current",
      })
    );
    await waitUpdate(lambda, name);
    version = latestVersion.Version;
  }

  return version;
}

async function run() {
  const functions = ["sendmail", "budget"];
  for (const fn of functions) {
    const version = await deploy(fn);
    if (!version) {
      throw new Error(`Fail to deploy ${fn}`);
    }
  }
}

run()
  .then(() => {
    console.log("Finished");
  })
  .catch((error) => {
    console.error(error.message);
    console.error(error.stack);
  });
