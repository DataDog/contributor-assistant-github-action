import { context } from '@actions/github'
import { octokit } from './octokit'

import * as core from '@actions/core'

// Note: why this  re-run of the last failed CLA workflow status check is explained this issue https://github.com/cla-assistant/github-action/issues/39
export async function reRunLastWorkFlowIfRequired() {
  if (context.eventName === 'pull_request') {
    core.debug(`rerun not required for event - pull_request`)
    return
  }

  const branch = await getBranchOfPullRequest()
  const workflowId = await getSelfWorkflowId()
  const runs = await listWorkflowRunsInBranch(branch, workflowId)

  if (runs.data.total_count > 0) {
    const run = runs.data.workflow_runs[0].id

    const isLastWorkFlowFailed: boolean = await checkIfLastWorkFlowFailed(run)
    if (isLastWorkFlowFailed) {
      core.debug(`Rerunning build run ${run}`)
      await reRunWorkflow(run).catch(error =>
        core.error(`Error occurred when re-running the workflow: ${error}`)
      )
    }
  }
}

async function getBranchOfPullRequest(): Promise<string> {
  const pullRequest = await octokit.pulls.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.issue.number
  })

  return pullRequest.data.head.ref
}

async function getSelfWorkflowId(): Promise<number> {
  const runId = context.runId
  if (!Number.isInteger(runId) || runId <= 0) {
    throw new Error(
      `Unable to determine the current workflow run id (GITHUB_RUN_ID is missing or invalid), can't resolve the workflow id..`
    )
  }

  let response: any
  try {
    response = await octokit.actions.getWorkflowRun({
      owner: context.repo.owner,
      repo: context.repo.repo,
      run_id: runId
    })
  } catch (error) {
    const status = (error as any)?.status
    if (status === 403 || status === 404) {
      throw new Error(
        `Unable to determine this workflow's id: GitHub API responded with ${status} when reading workflow run ${runId}. No fallback lookup is performed..`
      )
    }
    throw error
  }

  const workflowId = response?.data?.workflow_id
  if (!Number.isInteger(workflowId) || workflowId <= 0) {
    throw new Error(
      `Unable to determine this workflow's id: the current workflow run ${runId} returned a missing or invalid workflow_id..`
    )
  }
  return workflowId
}

async function listWorkflowRunsInBranch(
  branch: string,
  workflowId: number
): Promise<any> {
  console.debug(branch)
  const runs = await octokit.actions.listWorkflowRuns({
    owner: context.repo.owner,
    repo: context.repo.repo,
    branch,
    workflow_id: workflowId,
    event: 'pull_request_target'
  })
  return runs
}

async function reRunWorkflow(run: number): Promise<any> {
  // Personal Access token with repo scope is required to access this api - https://github.community/t/bug-rerun-workflow-api-not-working/126742
  await octokit.actions.reRunWorkflow({
    owner: context.repo.owner,
    repo: context.repo.repo,
    run_id: run
  })
}

async function checkIfLastWorkFlowFailed(run: number): Promise<boolean> {
  const response: any = await octokit.actions.getWorkflowRun({
    owner: context.repo.owner,
    repo: context.repo.repo,
    run_id: run
  })

  return response.data.conclusion == 'failure'
}
