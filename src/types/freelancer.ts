export type FreelancerRole =
  | 'cinematographer'
  | 'photographer'
  | 'editor'
  | 'colorist'
  | 'art_director'
  | 'producer'
  | 'production_assistant'
  | 'motion_designer'
  | 'sound_designer'
  | 'drone_pilot'
  | 'camera_assistant'
  | 'gaffer'
  | 'other'

export interface Freelancer {
  id: string
  workspace_id: string
  created_by: string
  name: string
  role: FreelancerRole
  daily_rate: number | null
  currency: string
  notes: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface FreelancerFormData {
  name: string
  role: FreelancerRole
  daily_rate: string // string para lidar com input livre
  currency: string
  notes: string
}

export type ActionResult =
  | { success: true; data?: Freelancer; message?: string }
  | { success: false; message: string }
