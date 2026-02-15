export interface SchoolSettings {
  id: number
  school_name: string
  school_motto: string | null
  address: string | null
  phone: string | null
  email: string | null
  logo_path: string | null
  mpesa_paybill: string | null
  sms_api_key?: string | null
  sms_api_secret?: string | null
  sms_sender_id?: string | null
  created_at: string
  updated_at: string
}

export interface SettingsAPI {
  getSettings: () => Promise<SchoolSettings>
  getSchoolSettings: () => Promise<SchoolSettings>
  updateSettings: (data: Partial<SchoolSettings>) => Promise<{ success: boolean }>

  // Secure Config (Phase 3)
  getSecureConfig(key: string): Promise<string | null>
  saveSecureConfig(key: string, value: string): Promise<boolean>
  getAllConfigs(): Promise<Record<string, string>>
  resetAndSeedDatabase(userId: number): Promise<{ success: boolean; error?: string; message?: string }>
  normalizeCurrencyScale(userId: number): Promise<{ success: boolean; error?: string; message?: string }>
}
