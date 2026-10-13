import type { ChinaFoodIdentityProvider, FoodIdentity, IdentityQuery, IdentityResult } from '../../application/ports/ChinaFoodIdentityProvider';
import type { ChinaFoodRepository } from '../../application/ports/ChinaFoodRepository';
import type { FoodBarcodeAssociation } from '../../domain/barcode/types';
import type { FoodScanRecord } from '../../domain/food/scan';

export type LocalFirstLookupResult =
  | { readonly status: 'local_found'; readonly record: FoodScanRecord; readonly barcode: FoodBarcodeAssociation }
  | { readonly status: 'china_service_found'; readonly identity: FoodIdentity }
  | { readonly status: 'not_found'; readonly providerStatus: IdentityResult['status']; readonly message: string }
  | { readonly status: 'stale'; readonly message: string };

/**
 * Local lookup always runs first. The optional domestic provider receives only
 * an already validated barcode and is never allowed to replace local records.
 */
export class LocalFirstChinaFoodLookup {
  private sequence = 0;
  private readonly local: Pick<ChinaFoodRepository, 'getFoodByBarcode'>;
  private readonly provider: ChinaFoodIdentityProvider | undefined;
  constructor(local: Pick<ChinaFoodRepository, 'getFoodByBarcode'>, provider?: ChinaFoodIdentityProvider) {
    this.local = local;
    this.provider = provider;
  }

  cancel(): void { this.sequence += 1; }

  async lookup(query: IdentityQuery, options: { readonly signal?: AbortSignal } = {}): Promise<LocalFirstLookupResult> {
    const token = ++this.sequence;
    const local = await this.local.getFoodByBarcode(query.lookupKey);
    if (token !== this.sequence) return { status: 'stale', message: '已切换到另一件商品，丢弃旧查询结果。' };
    if (local) return { status: 'local_found', record: local.record, barcode: local.barcode };
    const remote = this.provider
      ? await this.provider.lookup(query, options)
      : { status: 'not_configured' as const, message: '国内商品服务尚未配置。' };
    if (token !== this.sequence) return { status: 'stale', message: '已切换到另一件商品，丢弃旧查询结果。' };
    if (remote.status === 'found') return { status: 'china_service_found', identity: remote.identity };
    return { status: 'not_found', providerStatus: remote.status, message: remote.message };
  }
}

export function createLocalFirstChinaFoodLookup(
  local: Pick<ChinaFoodRepository, 'getFoodByBarcode'>,
  provider?: ChinaFoodIdentityProvider,
): LocalFirstChinaFoodLookup {
  return new LocalFirstChinaFoodLookup(local, provider);
}
