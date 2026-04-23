import { notFound } from 'next/navigation'
import { getPostForAdmin } from '@/lib/insights/actions'
import PostEditorForm from './post-editor-form'

export const dynamic = 'force-dynamic'

export default async function EditInsightPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const post = await getPostForAdmin(id)
  if (!post) notFound()

  return <PostEditorForm post={post} />
}
