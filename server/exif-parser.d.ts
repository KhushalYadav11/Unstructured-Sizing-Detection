declare module 'exif-parser' {
  interface ExifTags {
    FocalLength?: number;
    ISO?: number;
    ExposureTime?: number;
    FNumber?: number;
    DateTimeOriginal?: number;
    GPSLatitude?: number;
    GPSLongitude?: number;
    GPSAltitude?: number;
    [key: string]: any;
  }

  interface ExifResult {
    tags?: ExifTags;
    imageSize?: {
      width: number;
      height: number;
    };
    thumbnailOffset?: number;
    thumbnailLength?: number;
    thumbnailType?: number;
  }

  interface ExifParser {
    parse(): ExifResult;
    enableSimpleValues(enabled: boolean): ExifParser;
    enablePointers(enabled: boolean): ExifParser;
    enableTagNames(enabled: boolean): ExifParser;
    enableImageSize(enabled: boolean): ExifParser;
    enableReturnTags(enabled: boolean): ExifParser;
  }

  interface ExifParserFactory {
    create(buffer: Buffer): ExifParser;
  }

  const factory: ExifParserFactory;
  export default factory;
}