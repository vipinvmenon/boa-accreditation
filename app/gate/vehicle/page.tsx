import type { Metadata } from 'next'
import { VehicleScreen } from './vehicle-screen'

export const metadata: Metadata = { title: 'Vehicle' }

export default function VehiclePage() {
  return <VehicleScreen />
}
