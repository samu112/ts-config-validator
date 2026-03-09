export interface SimpleConfig {
  name: string;
  port: number;
  debug: boolean;
  environment: 'dev' | 'prod' | 'staging';
}
