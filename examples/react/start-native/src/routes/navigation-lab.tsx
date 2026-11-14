import { createFileRoute } from '@tanstack/react-router'
import { labNavigator } from '../lab-navigation'
import { NavigationLab } from '../ui/navigation-lab'
export const Route = createFileRoute('/navigation-lab')({
  staticData: {
    native: { title: 'Standard Navigation', navigator: labNavigator },
  },
  component: NavigationLab,
})
