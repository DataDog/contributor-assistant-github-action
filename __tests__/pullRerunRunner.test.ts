import * as core from '@actions/core'
import * as github from '@actions/github'
import { octokit } from '../src/octokit'
import { reRunLastWorkFlowIfRequired } from '../src/pullRerunRunner'

jest.mock('@actions/core')
jest.mock('@actions/github')
jest.mock('../src/octokit', () => ({
  octokit: {
    pulls: {
      get: jest.fn()
    },
    actions: {
      getWorkflowRun: jest.fn(),
      listWorkflowRuns: jest.fn(),
      reRunWorkflow: jest.fn(),
      listRepoWorkflows: jest.fn()
    }
  }
}))

const mockPullsGet = jest.mocked((octokit as any).pulls.get)
const mockGetWorkflowRun = jest.mocked((octokit as any).actions.getWorkflowRun)
const mockListWorkflowRuns = jest.mocked(
  (octokit as any).actions.listWorkflowRuns
)
const mockReRunWorkflow = jest.mocked((octokit as any).actions.reRunWorkflow)
const mockListRepoWorkflows = jest.mocked(
  (octokit as any).actions.listRepoWorkflows
)
const mockCoreError = jest.mocked(core.error)

const OWNER = 'cla-assistant'
const REPO = 'github-action'
const CURRENT_WORKFLOW_ID = 222880537
const CURRENT_RUN_ID = 987654321
const LAST_RUN_ID = 123456

function setContext(overrides: Record<string, any> = {}) {
  // @ts-ignore - hand-built context, mirroring __tests__/main.test.ts
  github.context = {
    eventName: 'pull_request_target',
    workflow: 'CLA Assistant',
    repo: { owner: OWNER, repo: REPO },
    issue: { owner: OWNER, repo: REPO, number: 232 },
    runId: CURRENT_RUN_ID,
    ...overrides
  }
}

/**
 * Queue the two getWorkflowRun responses of a full pass through
 * reRunLastWorkFlowIfRequired: the current-run lookup (workflow_id) and the
 * last-run conclusion check. Resets the mock first so previously queued
 * responses never leak into this test.
 */
function mockCurrentRunLookup(lastConclusion: string) {
  mockGetWorkflowRun.mockReset()
  mockGetWorkflowRun
    .mockResolvedValueOnce({ data: { workflow_id: CURRENT_WORKFLOW_ID } })
    .mockResolvedValueOnce({ data: { conclusion: lastConclusion } })
}

describe('reRunLastWorkFlowIfRequired', () => {
  beforeEach(() => {
    setContext()
    mockPullsGet.mockResolvedValue({
      data: { head: { ref: 'feature-branch' } }
    })
    mockListWorkflowRuns.mockResolvedValue({
      data: { total_count: 1, workflow_runs: [{ id: LAST_RUN_ID }] }
    })
    mockReRunWorkflow.mockResolvedValue(undefined)
    // Belt-and-braces: if the removed pagination lookup is ever called again,
    // it fails loudly here instead of silently falling back.
    mockListRepoWorkflows.mockRejectedValue(
      new Error('API unavailable: listRepoWorkflows must not be called')
    )
  })

  describe('current-run workflow id lookup', () => {
    test('resolves the workflow id from the current run and reruns the failed last run', async () => {
      mockCurrentRunLookup('failure')

      await reRunLastWorkFlowIfRequired()

      expect(mockGetWorkflowRun).toHaveBeenNthCalledWith(1, {
        owner: OWNER,
        repo: REPO,
        run_id: CURRENT_RUN_ID
      })
      expect(mockListWorkflowRuns).toHaveBeenCalledWith({
        owner: OWNER,
        repo: REPO,
        branch: 'feature-branch',
        workflow_id: CURRENT_WORKFLOW_ID,
        event: 'pull_request_target'
      })
      expect(mockGetWorkflowRun).toHaveBeenNthCalledWith(2, {
        owner: OWNER,
        repo: REPO,
        run_id: LAST_RUN_ID
      })
      expect(mockReRunWorkflow).toHaveBeenCalledWith({
        owner: OWNER,
        repo: REPO,
        run_id: LAST_RUN_ID
      })
      expect(mockListRepoWorkflows).not.toHaveBeenCalled()
    })

    type LookupFailureCase = [string, () => void, string]
    const lookupFailureCases: LookupFailureCase[] = [
      [
        'the workflow run request is rejected with 403',
        () =>
          mockGetWorkflowRun.mockRejectedValueOnce(
            Object.assign(new Error('Resource not accessible'), { status: 403 })
          ),
        `Unable to determine this workflow's id: GitHub API responded with 403 when reading workflow run ${CURRENT_RUN_ID}. No fallback lookup is performed..`
      ],
      [
        'the workflow run request is rejected with 404',
        () =>
          mockGetWorkflowRun.mockRejectedValueOnce(
            Object.assign(new Error('Not Found'), { status: 404 })
          ),
        `Unable to determine this workflow's id: GitHub API responded with 404 when reading workflow run ${CURRENT_RUN_ID}. No fallback lookup is performed..`
      ],
      [
        'the workflow run response has no workflow_id',
        () => mockGetWorkflowRun.mockResolvedValueOnce({ data: {} }),
        `Unable to determine this workflow's id: the current workflow run ${CURRENT_RUN_ID} returned a missing or invalid workflow_id..`
      ],
      [
        'the workflow run response has workflow_id 0',
        () =>
          mockGetWorkflowRun.mockResolvedValueOnce({
            data: { workflow_id: 0 }
          }),
        `Unable to determine this workflow's id: the current workflow run ${CURRENT_RUN_ID} returned a missing or invalid workflow_id..`
      ],
      [
        'the workflow run response has a string workflow_id',
        () =>
          mockGetWorkflowRun.mockResolvedValueOnce({
            data: { workflow_id: String(CURRENT_WORKFLOW_ID) }
          }),
        `Unable to determine this workflow's id: the current workflow run ${CURRENT_RUN_ID} returned a missing or invalid workflow_id..`
      ]
    ]

    test.each(lookupFailureCases)(
      'rejects with an explicit error when %s',
      async (_label: string, setMock: () => void, message: string) => {
        mockGetWorkflowRun.mockReset()
        setMock()

        await expect(reRunLastWorkFlowIfRequired()).rejects.toThrow(
          new Error(message)
        )
        expect(mockListRepoWorkflows).not.toHaveBeenCalled()
        expect(mockListWorkflowRuns).not.toHaveBeenCalled()
        expect(mockReRunWorkflow).not.toHaveBeenCalled()
      }
    )

    test('rethrows request errors other than 403/404 unchanged', async () => {
      mockGetWorkflowRun.mockReset()
      const serverError = Object.assign(
        new Error('Server error while reading the workflow run'),
        { status: 500 }
      )
      mockGetWorkflowRun.mockRejectedValueOnce(serverError)

      await expect(reRunLastWorkFlowIfRequired()).rejects.toBe(serverError)
      expect(mockListRepoWorkflows).not.toHaveBeenCalled()
      expect(mockListWorkflowRuns).not.toHaveBeenCalled()
      expect(mockReRunWorkflow).not.toHaveBeenCalled()
    })

    const badRunIdCases: Array<[string, number]> = [
      ['NaN', NaN],
      ['0', 0]
    ]
    test.each(badRunIdCases)(
      'rejects before the workflow lookup when the current run id is %s',
      async (_label: string, runId: number) => {
        setContext({ runId })

        await expect(reRunLastWorkFlowIfRequired()).rejects.toThrow(
          new Error(
            `Unable to determine the current workflow run id (GITHUB_RUN_ID is missing or invalid), can't resolve the workflow id..`
          )
        )
        expect(mockGetWorkflowRun).not.toHaveBeenCalled()
        expect(mockListRepoWorkflows).not.toHaveBeenCalled()
        expect(mockListWorkflowRuns).not.toHaveBeenCalled()
        expect(mockReRunWorkflow).not.toHaveBeenCalled()
      }
    )
  })

  describe('preserved rerun behavior', () => {
    test('returns early for pull_request events without calling octokit at all', async () => {
      setContext({ eventName: 'pull_request' })

      await reRunLastWorkFlowIfRequired()

      expect(mockPullsGet).not.toHaveBeenCalled()
      expect(mockGetWorkflowRun).not.toHaveBeenCalled()
      expect(mockListWorkflowRuns).not.toHaveBeenCalled()
      expect(mockReRunWorkflow).not.toHaveBeenCalled()
      expect(mockListRepoWorkflows).not.toHaveBeenCalled()
    })

    test('does not rerun when the last run in the branch succeeded', async () => {
      mockCurrentRunLookup('success')

      await reRunLastWorkFlowIfRequired()

      expect(mockPullsGet).toHaveBeenCalled()
      expect(mockGetWorkflowRun).toHaveBeenCalledTimes(2)
      expect(mockListWorkflowRuns).toHaveBeenCalledWith({
        owner: OWNER,
        repo: REPO,
        branch: 'feature-branch',
        workflow_id: CURRENT_WORKFLOW_ID,
        event: 'pull_request_target'
      })
      expect(mockReRunWorkflow).not.toHaveBeenCalled()
    })

    test('logs and continues when reRunWorkflow rejects', async () => {
      mockCurrentRunLookup('failure')
      mockReRunWorkflow.mockRejectedValue(new Error('rerun rejected'))

      await expect(reRunLastWorkFlowIfRequired()).resolves.toBeUndefined()

      expect(mockReRunWorkflow).toHaveBeenCalled()
      expect(mockCoreError).toHaveBeenCalledWith(
        `Error occurred when re-running the workflow: Error: rerun rejected`
      )
    })
  })
})
