import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, access, unlink, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { checkLinks } from '../scripts/check-links.mjs';

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8', timeout: 120_000,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
  });
  if (result.error) throw result.error;
  return { ...result, output: result.stdout + result.stderr };
}

test('실제 오류를 넣어 품질 검사와 초안 제외 동작 확인', async t => {
  const id = `quality-${randomUUID()}`;
  const post = resolve('src/content/posts', `${id}.md`);
  const output = resolve('dist/posts', id, 'index.html');
  const temporary = await mkdtemp(join(tmpdir(), 'blog-quality-'));
  const index = join(temporary, 'index.html');
  const target = join(temporary, 'target.html');
  const badMarkdown = join(temporary, 'invalid.md');
  const metadata = 'title: "검사 글"\ndescription: "검사 설명"\npubDate: 2026-11-01\ncategory: development\n';
  const build = () => run('node_modules/astro/bin/astro.mjs', ['build']);

  try {
    await t.test('마크다운 문법 오류 차단', async () => {
      await writeFile(badMarkdown, '#제목 앞 공백 누락\n');
      const result = run('node_modules/markdownlint-cli2/markdownlint-cli2-bin.mjs', ['--config', '.markdownlint-cli2.jsonc', badMarkdown]);
      assert.notEqual(result.status, 0, result.output);
      assert.match(result.output, /MD018/);
    });

    await t.test('정상 글 렌더링', async () => {
      await writeFile(post, `---\n${metadata}draft: false\n---\n\n## 한글 소제목\n\n검사 본문\n`);
      const result = build();
      assert.equal(result.status, 0, result.output);
      assert.match(await readFile(output, 'utf8'), /검사 본문/);
    });

    await t.test('필수 메타데이터 오류 차단', async () => {
      await writeFile(post, `---\n${metadata.replace('title: "검사 글"', 'title: 42')}draft: false\n---\n`);
      const result = build();
      assert.notEqual(result.status, 0, result.output);
      assert.match(result.output, /title/);
    });

    await t.test('draft 미지정 글과 명시적 초안은 출력에서 제외', async () => {
      for (const draft of ['', 'draft: true\n']) {
        await writeFile(post, `---\n${metadata}${draft}---\n\n비공개 초안 검사\n`);
        const result = build();
        assert.equal(result.status, 0, result.output);
        await assert.rejects(access(output), { code: 'ENOENT' });
      }
    });

    await t.test('정상 링크 통과 및 누락 파일·앵커 차단', async () => {
      await writeFile(target, '<h1 id="한글">대상</h1>');
      const check = () => checkLinks({ root: temporary, inputs: [index], stdio: 'pipe' });
      await writeFile(index, '<a href="/target.html#%ED%95%9C%EA%B8%80">정상 링크</a>');
      let result = check();
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      for (const href of ['/missing.html', '/target.html#missing']) {
        await writeFile(index, `<a href="${href}">잘못된 링크</a>`);
        result = check();
        assert.ifError(result.error);
        assert.notEqual(result.status, 0, result.stdout + result.stderr);
      }
    });
  } finally {
    for (const path of [post, index, target, badMarkdown]) {
      await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
    await rmdir(temporary);
  }
});
