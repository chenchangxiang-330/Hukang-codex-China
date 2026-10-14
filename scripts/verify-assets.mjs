import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const expectedIcon = 'd02fb58e0b5cf4617cf84f61a26e9d7dc5419a224e5ab12b173d096bea5ff4c2';
const expectedModels = {
  detector: 'a431985659dc921974177a95adcfbb90fd9e51989a5e04d70d0b75f597b6e61d',
  recognizer: 'da72dc72ca4dc220df0dfde68c1dedc31c58d3e76a25871122e5056227d50092',
};

try {
  if (digest(readFileSync(path.join(root, 'assets/icon.png'))) !== expectedIcon) {
    throw new Error('Original Hukang App icon digest mismatch');
  }
  const manifest = JSON.parse(readFileSync(path.join(root, 'models/paddleocr/v5-mobile/manifest.json'), 'utf8'));
  if (manifest.verification.status !== 'verified_artifacts') {
    throw new Error('Genuine model assets have not been acquired and verified; build must stop');
  }
  const results = {};
  for (const [name, expected] of Object.entries(expectedModels)) {
    const entry = manifest.models[name];
    const bytes = readFileSync(path.join(root, entry.bundledPath));
    if (entry.sha256 !== expected || digest(bytes) !== expected) {
      throw new Error(`${name}: pinned model SHA-256 mismatch`);
    }
    const config = readFileSync(path.join(root, entry.configPath));
    if (!entry.configSha256 || digest(config) !== entry.configSha256) {
      throw new Error(`${name}: paired inference YAML missing or changed`);
    }
    if (!config.toString('utf8').includes(`model_name: PP-OCRv5_mobile_${name === 'detector' ? 'det' : 'rec'}`)) {
      throw new Error(`${name}: wrong paired model config`);
    }
    results[name] = { sha256: expected, sizeBytes: bytes.length, configSha256: entry.configSha256 };
  }
  const dictionary = manifest.models.recognizer.dictionary;
  const yaml = readFileSync(path.join(root, dictionary.path), 'utf8');
  const dictionaryStart = yaml.indexOf('  character_dict:');
  const count = dictionaryStart < 0 ? 0 : yaml.slice(dictionaryStart).split(/\r?\n/).filter((line) => /^  -(?:\s|$)/u.test(line)).length;
  if (count < 1000 || count !== dictionary.characterCount || !yaml.includes('  - 中')) {
    throw new Error('Embedded official Chinese dictionary is empty, incomplete, or mismatched');
  }
  if (dictionary.expectedOutputClasses !== dictionary.effectiveCharacterCount + 1) {
    throw new Error('CTC output class count metadata mismatch');
  }
  if (manifest.productionNetwork !== false || manifest.automaticModelDownload !== false) {
    throw new Error('Production model network/download policy mismatch');
  }
  console.log(JSON.stringify({ status: 'verified_artifacts', icon: expectedIcon, models: results, dictionaryCount: count }, null, 2));
} catch (error) {
  console.error(`Asset verification failed: ${error.message}`);
  process.exitCode = 1;
}
