/* eslint-disable import/first */
require('dotenv').config()

import asyncRetry from 'async-retry'
import buildExtensions from './tasks/build-extensions'
import deployExtensions from './tasks/deploy-extensions'
import createEnvironment from './tasks/create-new-environment'
import deleteStaleEnvironments from './tasks/delete-stale-environments'
import deleteEnvironment from './tasks/delete-new-environment'
import createConfigurationFiles from './tasks/create-configuration-files'
import runCypress from './tasks/run-cypress'

const config = {
  managementToken: process.env.CONTENTFUL_CMA_TOKEN,
  spaceId: process.env.CONTENTFUL_SPACE_ID,
  baseUrl: process.env.CONTENTFUL_APP,
  testLocalSdk: process.env.TEST_LOCAL_SDK === 'true'
}

function listAllEnvironmentVariables() {
  ;['CONTENTFUL_SPACE_ID', 'CYPRESS_baseUrl', 'TEST_LOCAL_SDK'].forEach(envvar => {
    console.log(`${envvar}=${process.env[envvar]}`)
  })
  ;['CONTENTFUL_CMA_TOKEN'].forEach(envvar => {
    console.log(`${envvar}=${process.env[envvar].slice(0, 5)}...`)
  })
}

let environmentId

const cleanup = async () => {
  if (environmentId) {
    try {
      await asyncRetry(
        () => {
          return deleteEnvironment(environmentId)
        },
        { retries: 3 }
      )
    } catch (e) {
      console.log(e)
      throw new Error('Failed to remove environment')
    }
  }
}

const run = async () => {
  listAllEnvironmentVariables()

  try {
    await deleteStaleEnvironments()
  } catch (e) {
    console.error('Could not delete all stale environments')
  }

  try {
    environmentId = await asyncRetry(
      () => {
        return createEnvironment()
      },
      { retries: 3 }
    )
  } catch (e) {
    console.log(e)
    throw new Error('Failed to create a new environment')
  }

  await createConfigurationFiles({
    managementToken: config.managementToken,
    spaceId: config.spaceId,
    environmentId
  })

  await buildExtensions({
    testLocalSdk: config.testLocalSdk
  })

  await deployExtensions()

  await runCypress()
}
;(async function main() {
  try {
    await run()
    await cleanup()
  } catch (err) {
    console.log(err)
    await cleanup()
    process.exit(1)
  }
})()
