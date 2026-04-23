export interface InsightPost {
  id:               string
  slug:             string
  title:            string
  category:         string
  excerpt:          string | null
  body_markdown:    string
  cover_image_url:  string | null
  status:           'draft' | 'published' | 'archived'
  published_at:     string | null
  author_email:     string | null
  created_at:       string
  updated_at:       string
}

export type InsightPostStatus = InsightPost['status']

export interface InsightPostInput {
  slug:             string
  title:            string
  category:         string
  excerpt?:         string | null
  body_markdown:    string
  cover_image_url?: string | null
  status:           InsightPostStatus
}
