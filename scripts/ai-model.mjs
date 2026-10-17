// Pinned demo weights; shared by installer and runtime identity checks.
export const AI_MODEL = {
  label: 'Qwen3-0.6B · Q4_K_M',
  name: 'Qwen_Qwen3-0.6B-Q4_K_M.gguf',
  revision: '60b85c0e3d8fe0f6474f406922a26d12aca4550d',
  sha256: '9acfc1e001311f34b4252001b626f2e466d592a42065f66571bff3790d4e1b14',
  license: 'Apache-2.0',
};
AI_MODEL.url = `https://huggingface.co/bartowski/Qwen_Qwen3-0.6B-GGUF/resolve/${AI_MODEL.revision}/${AI_MODEL.name}`;
