import { createFileRoute } from '@tanstack/react-router'
import { TagsScreen } from '../../../features/categories'

export const Route = createFileRoute('/_app/settings/tags')({
  component: TagsScreen,
})
