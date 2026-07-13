import { Injectable, Logger } from '@nestjs/common';

/** Mapa servicio (AppRoleName/health key) → repo en la organización de GitHub. */
const SERVICE_REPO: Record<string, string> = {
  gateway: 'gateway',
  identity: 'identity-service',
  products: 'products-service',
  orders: 'orders-service',
  financial: 'financial-service',
  fulfillment: 'fulfillment-service',
  notifications: 'notifications-service',
  reporting: 'reporting-service',
};

export interface GithubDeploy {
  available: boolean;
  repo?: string;
  workflow?: string;
  /** queued | in_progress | completed */
  status?: string;
  /** success | failure | cancelled | null (si sigue corriendo) */
  conclusion?: string | null;
  branch?: string;
  event?: string;
  commitMessage?: string;
  actor?: string;
  /** Nombre del job/etapa en curso (cuando status = in_progress). */
  currentStage?: string | null;
  createdAt?: string;
  updatedAt?: string;
  url?: string;
  note?: string;
}

const CACHE_TTL_MS = 30_000;
const ORG = process.env.GITHUB_ORG ?? 'ECIEXPRESSV2';

/**
 * Estado del último workflow de GitHub Actions de un microservicio (repos PÚBLICOS de la org,
 * así que funciona SIN token; `GITHUB_TOKEN` opcional solo sube el límite de rate). Cachea 30s
 * por repo para no toparse con el límite de 60/hora sin autenticar.
 */
@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);
  private readonly cache = new Map<string, { at: number; value: GithubDeploy }>();

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'eciexpress-reporting' };
    const token = process.env.GITHUB_TOKEN;
    // Ignora el placeholder de Key Vault: un Bearer 'REPLACE_ME' daría 401 (peor que sin token).
    if (token && token !== 'REPLACE_ME') h.Authorization = `Bearer ${token}`;
    return h;
  }

  async getDeploy(service: string): Promise<GithubDeploy> {
    const repo = SERVICE_REPO[service];
    if (!repo) return { available: false, note: `Sin repo mapeado para '${service}'.` };

    const cached = this.cache.get(repo);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

    const value = await this.fetchDeploy(repo);
    this.cache.set(repo, { at: Date.now(), value });
    return value;
  }

  private async fetchDeploy(repo: string): Promise<GithubDeploy> {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${ORG}/${repo}/actions/runs?per_page=1`,
        { headers: this.headers(), signal: AbortSignal.timeout(6000) },
      );
      if (res.status === 403) return { available: false, repo, note: 'Límite de GitHub alcanzado (agrega GITHUB_TOKEN).' };
      if (!res.ok) return { available: false, repo, note: `GitHub respondió ${res.status}.` };
      const body = (await res.json()) as { workflow_runs?: GhRun[] };
      const run = body.workflow_runs?.[0];
      if (!run) return { available: true, repo, note: 'Sin ejecuciones de workflow.' };

      const currentStage = run.status === 'in_progress' ? await this.currentJob(repo, run.id) : null;
      return {
        available: true,
        repo,
        workflow: run.name ?? run.display_title,
        status: run.status,
        conclusion: run.conclusion,
        branch: run.head_branch,
        event: run.event,
        commitMessage: run.head_commit?.message?.split('\n')[0],
        actor: run.actor?.login,
        currentStage,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        url: run.html_url,
      };
    } catch (e) {
      this.logger.warn(`GitHub deploy de ${repo} falló: ${(e as Error).message}`);
      return { available: false, repo, note: 'No se pudo consultar GitHub.' };
    }
  }

  /** Nombre del primer job que sigue corriendo, como "etapa actual". */
  private async currentJob(repo: string, runId: number): Promise<string | null> {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${ORG}/${repo}/actions/runs/${runId}/jobs`,
        { headers: this.headers(), signal: AbortSignal.timeout(6000) },
      );
      if (!res.ok) return null;
      const body = (await res.json()) as { jobs?: { name: string; status: string }[] };
      return body.jobs?.find((j) => j.status === 'in_progress')?.name
        ?? body.jobs?.find((j) => j.status === 'queued')?.name
        ?? null;
    } catch {
      return null;
    }
  }
}

interface GhRun {
  id: number;
  name?: string;
  display_title?: string;
  status: string;
  conclusion: string | null;
  head_branch: string;
  event: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  actor?: { login: string };
  head_commit?: { message?: string };
}
