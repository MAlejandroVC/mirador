import { createFileRoute } from '@tanstack/react-router'
import { CategoriesScreen } from '../../../features/categories'

export const Route = createFileRoute('/_app/settings/categories')({
  component: CategoriesScreen,
})
