import cloudinary from '../config/cloudinary.js'

/**
 * Deletes images from Cloudinary by their public IDs (storage_key in your DB).
 *
 * Uses api.delete_resources which accepts public IDs directly — NOT
 * delete_resources_by_asset_ids, which requires Cloudinary's internal asset_id
 * field (not stored in your schema).
 *
 * Cloudinary caps delete_resources at 100 public IDs per call, so we chunk
 * large arrays automatically.
 */
export const deleteFromCloudinary = async (publicIds: string[]): Promise<void> => {
  if (!publicIds || publicIds.length === 0) return

  const CHUNK_SIZE = 100
  const errors: { chunk: string[]; error: any }[] = []

  for (let i = 0; i < publicIds.length; i += CHUNK_SIZE) {
    const chunk = publicIds.slice(i, i + CHUNK_SIZE)
    try {
      const result = await cloudinary.api.delete_resources(chunk, {
        invalidate: true,       // purge CDN cache
        resource_type: 'image',
      })

      // Cloudinary returns per-resource results — log anything that wasn't deleted
      const failed = Object.entries(result.deleted ?? {})
        .filter(([, status]) => status !== 'deleted')
      
      if (failed.length > 0) {
        console.warn('Cloudinary: some resources were not deleted:', failed)
      }
    } catch (error) {
      // Collect errors per chunk rather than aborting the whole batch
      errors.push({ chunk, error })
      console.error(`Cloudinary bulk delete failed for chunk starting at index ${i}:`, error)
    }
  }

  if (errors.length > 0) {
    // Throw after all chunks attempted so the caller knows deletion was partial
    throw new Error(
      `Cloudinary delete partially failed for ${errors.length} chunk(s). ` +
      `Public IDs affected: ${errors.flatMap(e => e.chunk).join(', ')}`
    )
  }
}