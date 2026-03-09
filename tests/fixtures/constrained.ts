export interface ConstrainedConfig {
  /**
   * @minLength 3
   * @maxLength 20
   */
  username: string;

  /**
   * @min 1
   * @max 65535
   * @integer
   */
  port: number;

  /**
   * @pattern ^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$
   */
  id: string;

  /**
   * @length 3
   */
  currencyCode: string;

  /**
   * @dateFormat YYYY-MM-DD
   * @minLength 2024-01-01
   */
  startDate: string;

  /**
   * Plain Date property — validated as ISO 8601 with no custom format.
   */
  createdAt: Date;

  /**
   * @dateFormat YYYY-MM-DD
   * @minLength 2024-01-01
   * @maxLength 2099-12-31
   */
  scheduledDate: Date;

  optionalNote?: string;
}