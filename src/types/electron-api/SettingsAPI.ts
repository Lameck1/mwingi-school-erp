export interface SchoolSettings {
  id: number
  school_name: string
  school_address: string
  school_phone: string
  school_email: string
  school_website: string
  school_logo: string
  currency: string
  timezone: string
  date_format: string
  sms_api_key?: string
  sms_api_secret?: string
  sms_sender_id?: string
  mpesa_paybill?: string
  created_at: string
  updated_at: string
}

export interface SettingsAPI {
  getSettings(): Promise<SchoolSettings>
  updateSettings(data: Partial<SchoolSettings>): Promise<{ success: boolean }>
}