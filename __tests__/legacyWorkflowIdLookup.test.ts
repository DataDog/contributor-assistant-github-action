/**
 * Simulation harness for the v2.6.1 workflow-id pagination algorithm that the
 * commit "fix: resolve the current workflow id from the workflow run instead
 * of paginating the workflow list" removed from src/pullRerunRunner.ts
 * (getSelfWorkflowId).
 *
 * The baseline algorithm paginated
 * octokit.actions.listRepoWorkflows({per_page: 30, page}) and scanned each
 * page for an entry named like the current workflow (context.workflow). On
 * repos with many workflows GitHub intermittently serves mixed-order pages
 * (entries skipped and others duplicated), so the scan can exhaust every page
 * without ever seeing the current workflow and throw. The tests below replay
 * such page sequences against a faithful copy of the removed algorithm to
 * document the failure; the replacement resolves the workflow id directly
 * from the current workflow run (see __tests__/pullRerunRunner.test.ts).
 */

type LegacyWorkflow = { id: number; name: string }

type LegacyWorkflowPage = {
  data: {
    total_count: number
    workflows: LegacyWorkflow[]
  }
}

/**
 * Faithful copy of the removed pagination loop from
 * src/pullRerunRunner.ts as of v2.6.1 (only the octokit call is injected as
 * fetchPage, and the target workflow name - read from context.workflow in
 * the original - is passed in explicitly).
 */
async function legacyGetSelfWorkflowId(
  fetchPage: (page: number) => Promise<LegacyWorkflowPage>,
  workflowName: string
): Promise<number> {
  const perPage = 30
  let hasNextPage = true

  for (let page = 1; hasNextPage === true; page++) {
    const workflowList = await fetchPage(page)

    if (workflowList.data.total_count < page * perPage) {
      hasNextPage = false
    }

    const workflow = workflowList.data.workflows.find(
      w => w.name == workflowName
    )

    if (workflow) {
      return workflow.id
    }
  }

  throw new Error(
    `Unable to locate this workflow's ID in this repository, can't trigger job..`
  )
}

const TARGET_WORKFLOW_NAME = 'CLA Assistant'
const TARGET_FLEET_INDEX = 32
const TARGET_WORKFLOW_ID = 100000 + TARGET_FLEET_INDEX
const FLEET_SIZE = 75

/**
 * A 75-workflow fleet (3 pages at per_page=30). The target workflow sits at
 * index 32, well inside the fleet, so a complete and correctly ordered
 * listing always contains it.
 */
function buildFleet(): LegacyWorkflow[] {
  return Array.from({ length: FLEET_SIZE }, (_, index) => ({
    id: 100000 + index,
    name:
      index === TARGET_FLEET_INDEX
        ? TARGET_WORKFLOW_NAME
        : `workflow-${String(index).padStart(3, '0')}`
  }))
}

function pageOfWorkflows(
  fleet: LegacyWorkflow[],
  from: number,
  to: number
): LegacyWorkflowPage {
  return {
    data: {
      total_count: fleet.length,
      workflows: fleet.slice(from, to)
    }
  }
}

describe('legacy listRepoWorkflows pagination lookup (v2.6.1 baseline)', () => {
  const fleet = buildFleet()

  test('succeeds on correctly ordered pages (control: the harness is faithful)', async () => {
    const requestedPages: number[] = []
    // The GitHub API contract the algorithm assumed: consecutive,
    // non-overlapping, complete pages in a stable order.
    const fetchOrderedPages = async (page: number) => {
      requestedPages.push(page)
      return pageOfWorkflows(fleet, (page - 1) * 30, page * 30)
    }

    const workflowId = await legacyGetSelfWorkflowId(
      fetchOrderedPages,
      TARGET_WORKFLOW_NAME
    )

    expect(workflowId).toBe(TARGET_WORKFLOW_ID)
    expect(requestedPages).toEqual([1, 2])
  })

  test('misses the current workflow when GitHub serves mixed-order pages with skips and duplicates', async () => {
    const requestedPages: number[] = []
    // Observed GitHub behavior that triggered the bug: pages come back in a
    // mixed order, some entries are duplicated across pages, and others
    // (including the current workflow, fleet index 32) never appear on any
    // page. total_count still reports the true fleet size.
    const mixedOrderPages: LegacyWorkflowPage[] = [
      // page 1: fleet[0..29]
      pageOfWorkflows(fleet, 0, 30),
      // page 2: duplicates fleet[0..9], then jumps to fleet[40..59],
      // skipping fleet[30..39] (which contains the target)
      {
        data: {
          total_count: fleet.length,
          workflows: [...fleet.slice(0, 10), ...fleet.slice(40, 60)]
        }
      },
      // page 3 (last page: 75 < 3 * 30): duplicates fleet[50..59], then
      // fleet[60..74]
      {
        data: {
          total_count: fleet.length,
          workflows: [...fleet.slice(50, 60), ...fleet.slice(60, 75)]
        }
      }
    ]
    const fetchMixedOrderPages = async (page: number) => {
      requestedPages.push(page)
      return mixedOrderPages[page - 1]
    }

    await expect(
      legacyGetSelfWorkflowId(fetchMixedOrderPages, TARGET_WORKFLOW_NAME)
    ).rejects.toThrow(
      new Error(
        `Unable to locate this workflow's ID in this repository, can't trigger job..`
      )
    )
    expect(requestedPages).toEqual([1, 2, 3])
  })
})
