const core = require("@actions/core");
const github = require("@actions/github");

const LABEL_NAME = core.getInput("label_name");
const LABEL_COLOR = core.getInput("label_color");
const MAX_LINES = parseInt(core.getInput("max_lines_per_pull_request"));
const WARNING_MESSAGE = core.getInput("warning_message");
const CONGRAT_MESSAGE = core.getInput("congrat_message");
const STRICT_MODE = core.getInput("strict_mode") === "true";
const COMMENTS_ENABLED = core.getInput("enable_comments") === "true";

const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
const context = github.context;
const { owner, repo } = context.repo;
const { number, additions } = context.payload.pull_request;

async function main() {
  try {
    await ensureLabelExists();
    const isAlreadyLabeled = await checkIfAlreadyLabeled();
    const pullRequestExceedLOC = additions > MAX_LINES;

    const action = pullRequestExceedLOC
      ? processPullRequestWithErrors
      : processPullRequestWithoutErrors;

    await action(isAlreadyLabeled);
  } catch (error) {
    core.setFailed(error.message);
  }
}

/* 
  According to Github docs:
  "Every pull request is an issue, but not every issue is a pull request.
    For this reason, "shared" actions for both features, like
    manipulating assignees, labels and milestones, are provided within the Issues API."

  That's why we are using the issues API instead of pulls API to perform the actions here.
*/
async function ensureLabelExists() {
  try {
    await octokit.issues.getLabel({
      owner,
      repo,
      name: LABEL_NAME,
    });
  } catch (error) {
    if (error.message === "Not Found") {
      await octokit.issues.createLabel({
        owner,
        repo,
        name: LABEL_NAME,
        color: LABEL_COLOR,
        description:
          "[Warning Label] for use when a Pull Request is doing to many changes at the same time.",
      });
    }
  }
}

async function checkIfAlreadyLabeled() {
  const currentLabels = await octokit.issues.listLabelsOnIssue({
    owner,
    repo,
    issue_number: number,
  });

  return currentLabels.data.find((label) => label.name === LABEL_NAME);
}

async function processPullRequestWithErrors(alreadyLabeled) {
  if (!alreadyLabeled) {
    await octokit.issues.addLabels({
      owner,
      repo,
      issue_number: number,
      labels: [LABEL_NAME],
    });

    COMMENTS_ENABLED &&
      (await octokit.issues.createComment({
        owner,
        repo,
        issue_number: number,
        body: WARNING_MESSAGE,
      }));
  }

  STRICT_MODE && core.setFailed("Max amount of LOC excedeed.");
}

async function processPullRequestWithoutErrors(alreadyLabeled) {
  if (alreadyLabeled) {
    await octokit.issues.removeLabel({
      owner,
      repo,
      issue_number: number,
      name: LABEL_NAME,
    });

    COMMENTS_ENABLED &&
      (await octokit.issues.createComment({
        owner,
        repo,
        issue_number: number,
        body: CONGRAT_MESSAGE,
      }));
  }
}

function test() {
  console.log("Useless comment");
  console.log("Useless comment");
  console.log("Useless comment");
  console.log("Useless comment");
  console.log("Useless comment");
  console.log("Useless comment");
  console.log("Useless comment");
}

main();
