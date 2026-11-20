import { lockPullRequest } from '../src/pullrequest/pullRequestLock'

// Factory mock (not automock): loading the real src/octokit module requires
// a GITHUB_TOKEN and throws without one.
jest.mock('../src/octokit', () => ({
  octokit: {
    issues: {
      lock: jest.fn()
    }
  }
}))

const mockedLockPullRequest = jest.mocked(lockPullRequest)

// Placeholder suite: lockPullRequest behavior is not covered yet. This file
// previously imported modules removed in the src/ restructure
// (src/checkcla, src/pullRequestLock) and never ran a test.
describe('lockPullRequest', () => {
  test('is exported from src/pullrequest/pullRequestLock', () => {
    expect(typeof mockedLockPullRequest).toBe('function')
  })
})
