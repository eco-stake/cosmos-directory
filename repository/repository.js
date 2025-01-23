import git from 'isomorphic-git'
import * as http from 'isomorphic-git/http/node/index.cjs'
import fs from 'fs'
import path from 'path'
import _ from 'lodash'
import Bugsnag from "@bugsnag/js"
import { join } from 'path';
import { timeStamp } from '../utils.js';

function Repository(client, url, branch, opts) {
  opts = opts || {}
  const name = opts.name || url.split('/').slice(-1)[0]
  const repoDir = join(process.cwd(), '../' + name)
  const repoPath = join(repoDir, opts.path || '')
  const exclude = opts.exclude || []

  async function updateRepo() {
    if(fs.existsSync(repoDir)) fs.rmSync(repoDir, {recursive: true})
    await git.clone({
      fs,
      http,
      dir: repoDir,
      ref: branch,
      url: url,
      depth: 1,
      singleBranch: true,
      skipCheckout: true
    })
    await git.fetch({ fs, http, dir: repoDir, ref: branch, singleBranch: true });
    await git.checkout({ fs, dir: repoDir, ref: branch, force: true });
  }

  async function latestCommit(count) {
    let commits = await git.log({
      fs,
      dir: repoDir,
      ref: `origin/${branch}`,
      depth: count || 1,
    })
    return !count || count === 1 ? commits[0] : commits
  }

  function buildData(dir) {
    const jsonFiles = fs.readdirSync(join(repoPath, dir)).filter(file => path.extname(file) === '.json');
    const data = jsonFiles.reduce((sum, filename) => {
      const path = join(repoPath, dir, filename);
      const data = fs.existsSync(path) ? fs.readFileSync(path) : undefined
      const json = data && JSON.parse(data);
      sum[filename.replace(/\.[^.]*$/,'')] = json
      return sum
    }, {})
    return {
      path: dir,
      ...data
    };
  }

  async function refresh() {
    try {
      timeStamp('Updating repository', name);
      await updateRepo();
      await loadData();
    } catch (error) {
      Bugsnag.notify(error, function (event) {
        event.context = name
      })
      timeStamp('Failed to update', name, error);
    }
  }

  async function loadData() {
    const directories = fs.readdirSync(repoPath, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name);

    const allData = await Promise.all(directories.map(async dir => {
      if (dir.startsWith('.') || exclude.includes(dir)) {
        return;
      }

      const path = join(repoPath, dir);
      if(opts.require && !fs.existsSync(join(path, opts.require))){
        return
      }

      const data = buildData(dir);

      if(opts.filter && !opts.filter(data)){
        await client.del([name, dir].join(':'))
        return
      }

      await client.json.set([name, dir].join(':'), '$', data)

      return data
    }, {}));

    await client.json.set([name, 'paths'].join(':'), '$', _.compact(allData).map(el => el.path))

    if(opts.storeMeta) await opts.storeMeta(name, _.compact(allData))

    const commit = await latestCommit()
    await client.json.set([name, 'commit'].join(':'), '$', commit)

    await client.json.set([name, 'repository'].join(':'), '$', {
      name,
      url,
      branch
    })
  }

  return {
    refresh
  }
}

export default Repository
