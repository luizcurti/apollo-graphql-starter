export type ApiFilterOrder = 'asc' | 'desc';

export interface ApiFiltersInput {
  _sort?: string;
  _order?: ApiFilterOrder;
  _start?: number;
  _limit?: number;
}
