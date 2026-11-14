# Deploy failed: AccessDenied on `iam:UntagUser`

Date: 2026-11-14. Status: fixed, Deploy green after re-run.

## Symptom

The first Deploy after merging PR #5 (CloudWatch monitoring, "Mini Banker Web" title) failed at `terraform apply`:

```
Error: updating tags for IAM User (bdsmini-dev-github-deploy): untagging resource:
operation error IAM: UntagUser, https response error StatusCode: 403 ... AccessDenied:
User: arn:aws:iam::<account>:user/bdsmini-dev-github-deploy is not authorized to perform:
iam:UntagUser on resource: user bdsmini-dev-github-deploy
  with module.github_oidc.aws_iam_user.deploy[0]
```

## Cause

The deploy user had a tag the Terraform config does not know about:

```
AKIA...  =  dev-github-deploy
```

The key is the access key id. The IAM console adds this "description tag" when you create an access key there. I had asked for a new key after recreating the user, and it was created in the console. Terraform manages the user's tags (`project`, `environment` via `default_tags`), saw an extra tag, and planned to remove it. The deploy user's policy does not allow tag changes on itself (it cannot edit its own identity), so CI got a 403. A local plan as `mbd-admin` showed the same single in-place change, which confirmed the diagnosis.

## Fix

As admin, remove the tag. This does not touch the access key.

```sh
aws iam untag-user --user-name bdsmini-dev-github-deploy --tag-keys <ACCESS_KEY_ID> --profile mbd-admin
cd infra/envs/dev && AWS_PROFILE=mbd-admin terraform plan   # "No changes"
gh run rerun <failed Deploy run id>
```

## Prevent it

- Create deploy keys with the CLI, not the console. The CLI adds no tag:
  `aws iam create-access-key --user-name bdsmini-dev-github-deploy --profile mbd-admin`
- If tags keep appearing, either add `lifecycle { ignore_changes = [tags, tags_all] }` to `aws_iam_user.deploy` in `infra/modules/github_oidc/main.tf`, or grant the deploy user `iam:TagUser`, `iam:UntagUser`, `iam:ListUserTags` on itself. The second needs a local admin apply because the user cannot change its own policy.

## What this run did and did not prove

- Proved: the new deploy-user key works, CI can plan and apply against the rebuilt environment, and a frontend change reaches AWS (the live bundle changed and contains "Mini Banker Web").
- Not proved: a backend change reaching Lambda through CI. The Lambdas were already running the new code from a local apply earlier that day (last modified 08:47 UTC, before the CI run), so the CI plan had no Lambda changes. Test it by making a small backend change and merging it.

## Related issues from the same day

- The deploy user and the whole dev environment had been deleted outside Terraform (`infra/teardown.sh` and a manual IAM delete), so the first plan showed 56 resources to add. State and AWS must be compared (`terraform plan`, `aws lambda list-functions`) before applying anything that looks like a rebuild.
- A deleted deploy user takes its access keys with it, so the GitHub secrets `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` must be replaced after recreating it.
- CI now skips docs-only pushes to `main` (`paths-ignore` in `.github/workflows/ci.yml`), so docs changes no longer trigger Deploy.
