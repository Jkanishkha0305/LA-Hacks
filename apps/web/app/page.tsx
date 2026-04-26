import { ParcelProvider } from '@/lib/parcel-context'
import { VisionProvider } from '@/lib/vision-context'
import { LayerProvider } from '@/lib/layer-context'
import { ApiKeyProvider } from '@/lib/api-key-context'
import { Sidebar } from '@/components/sidebar'
import { Dashboard } from '@/components/dashboard'

export default function Page() {
  return (
    <ApiKeyProvider>
      <ParcelProvider>
        <VisionProvider>
          <LayerProvider>
            <div className="flex h-svh w-full overflow-hidden">
              <Sidebar />
              <Dashboard />
            </div>
          </LayerProvider>
        </VisionProvider>
      </ParcelProvider>
    </ApiKeyProvider>
  )
}
