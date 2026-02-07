import { useDeviceOrientation } from '@/hooks/useDeviceOrientation'

/**
 * Floating debug panel displaying real-time device orientation sensor data.
 * Shows a permission request button on iOS devices before sensor access is granted.
 */
export function SensorDebug() {
  const { data, error, permissionGranted, requestAccess } = useDeviceOrientation()

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white/90 backdrop-blur p-4 rounded-xl shadow-lg border border-gray-200 min-w-[200px]">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">
        Device Orientation
      </h3>

      {error && (
        <p className="text-red-500 text-xs mb-2">{error}</p>
      )}

      {!permissionGranted ? (
        <button
          onClick={requestAccess}
          className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
        >
          Enable Sensors
        </button>
      ) : data ? (
        <div className="space-y-1 text-sm font-mono">
          <div className="flex justify-between">
            <span className="text-gray-500">Alpha</span>
            <span className="text-gray-900">{data.alpha.toFixed(1)}°</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Beta</span>
            <span className="text-gray-900">{data.beta.toFixed(1)}°</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Gamma</span>
            <span className="text-gray-900">{data.gamma.toFixed(1)}°</span>
          </div>
          <div className="pt-1 border-t border-gray-200 mt-2">
            <span className="text-xs text-gray-400">
              {data.absolute ? 'Absolute (Earth)' : 'Relative'}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-gray-400 text-sm">Waiting for data...</p>
      )}
    </div>
  )
}
