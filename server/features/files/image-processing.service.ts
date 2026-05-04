import type { Buffer } from 'node:buffer'
import sharp from 'sharp'

export interface VariantSpec {
  variant: string
  size: number
}

export interface ImageVariantResult {
  variant: string
  buffer: Buffer
  mimeType: string
  width: number
  height: number
}

export const AVATAR_VARIANT_SPECS: VariantSpec[] = [
  { variant: 'sm', size: 64 },
  { variant: 'md', size: 128 },
  { variant: 'lg', size: 256 },
]

export const createImageProcessingService = () => {
  const generateVariants = async (
    buffer: Buffer,
    mimeType: string,
    specs: VariantSpec[],
  ): Promise<ImageVariantResult[]> => {
    const isPng = mimeType === 'image/png'
    const outputFormat = isPng ? 'png' as const : 'webp' as const
    const outputMimeType = isPng ? 'image/png' : 'image/webp'

    const results = await Promise.all(
      specs.map(async (spec) => {
        const resized = await sharp(buffer)
          .resize(spec.size, spec.size, { fit: 'cover' })
          .toFormat(outputFormat, outputFormat === 'webp' ? { quality: 85 } : {})
          .toBuffer()

        return {
          variant: spec.variant,
          buffer: resized,
          mimeType: outputMimeType,
          width: spec.size,
          height: spec.size,
        }
      }),
    )

    return results
  }

  return { generateVariants }
}

export type ImageProcessingService = ReturnType<typeof createImageProcessingService>
