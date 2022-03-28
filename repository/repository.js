import git from 'isomorphic-git'
import * as http from 'isomorphic-git/http/node/index.cjs'
import fs from 'fs'
import path from 'path'
import _ from 'lodash'
import { join } from 'path';
import { timeStamp } from '../utils.js';

function Repository(client, url, branch, opts) {
  opts = opts || {}
  const name = opts.name || url.split('/').slice(-1)[0]
  const repoDir = join(process.cwd(), '../' + name)
  const exclude = opts.exclude || []

  async function updateRepo() {
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
    await git.fetch({ fs, http, dir: repoDir, ref: branch, url: url, singleBranch: true });
    await git.checkout({ fs, dir: repoDir, ref: `origin/${branch}`, force: true });
  }

  function buildData(dir) {
    const jsonFiles = fs.readdirSync(join(repoDir, dir)).filter(file => path.extname(file) === '.json');
    const data = jsonFiles.reduce((sum, filename) => {
      const path = join(repoDir, dir, filename);
      const data = fs.existsSync(path) ? fs.readFileSync(path) : undefined
      const json = data && JSON.parse(data);
      sum[filename.replace(/\.[^.]*$/,'')] = json
      return sum
    }, {})
    return {
      directory: dir,
      ...data
    };
  }

  async function refresh() {
    try {
      timeStamp('Updating repository', name);
      await updateRepo();
      await loadData();
    } catch (error) {
      timeStamp('Failed to update', name, error);
    }
  }

  async function loadData() {
    const directories = fs.readdirSync(repoDir, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name);

    const allData = await Promise.all(directories.map(async dir => {
      if (dir.startsWith('.') || exclude.includes(dir))
        return;

      const data = buildData(dir);

      await client.json.set([name, dir].join(':'), '$', data)

      return data
    }, {}));

    await client.json.set([name, 'directories'].join(':'), '$', _.compact(allData).map(el => el.directory))
  }

  return {
    refresh
  }
}

export default Repository