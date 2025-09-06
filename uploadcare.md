Uploadcare URL API Reference
Search...
API endpoints
File information
File names
File groups
Image processing limitations
Image compression
Image resize and crop
Image rotation
Image overlays
Image colors
Image definition
Image recognition
Other image operations
Proxy
Signed URLs
CDN settings
Integrations
Other APIs
API docs by Redocly
URL API Reference (2022-11-28)
Download OpenAPI specification:Download

API support: help@uploadcare.com
Every uploaded file is immediately available on the Uploadcare CDN. The CDN includes on-the-fly processing features and can work as a proxy.

API endpoints
Access files in Uploadcare CDN at ucarecdn.com over HTTP/HTTPS like this: https://ucarecdn.com/:uuid/

You can add CDN operations by including directives in the CDN URL: https://ucarecdn.com/:uuid/-/:operation/:params/:filename

:uuid stands for the unique file identifier, UUID, assigned on upload.
/-/ is a mandatory parsing delimiter to divide operations and other path components.
:operation/:params/ is a CDN operation directive with parameters.
:filename is an optional filename you can add after a trailing slash /.
You can stack two and more operations like this: -/:operation/:params/-/:operation/:params/

File information
There're few ways to get information about uploaded file. On of them is on-the-fly with a request to CDN.

Note: Other APIs also let you read file info: after Upload and at REST.

File info as JSON
Returns file-related information, such as image dimensions or geo tagging data in the JSON format.

path Parameters
uuid
required
string
Example: d7fe74ac-65b8-4ade-875f-ccd92759a70f
Unique file identifier

Responses
200
File

404
Image with "File not found" text.


get
/{uuid}/-/json/

Response samples
200
Content type
application/json

Copy
Expand allCollapse all
{
"id": "d7fe74ac-65b8-4ade-875f-ccd92759a70f",
"dpi": [
300,
300
],
"width": 3432,
"format": "JPEG",
"height": 3432,
"sequence": false,
"color_mode": "RGB",
"orientation": null,
"geo_location": null,
"datetime_original": "2020-06-07T10:38:16",
"hash": "e98d9466a33a9c8b"
}
File names
Your original filenames can be accessed via REST API. Make a request to receive a JSON response with file parameters including original_filename.

You can set an optional filename that users will see instead of the original name:

https://ucarecdn.com/:uuid/:filename

:filename should comply with file name conventions and it should be a valid part of a URL. For example, filename.ext.

Here are some examples with full CDN URLs:

Safe:

// adding a simple filename
https://ucarecdn.com/85b5644f-e692-4855-9db0-8c5a83096e25/image.jpg

// using a char allowed in the pchar definition
https://ucarecdn.com/85b5644f-e692-4855-9db0-8c5a83096e25/image@2x.jpg

// allowed in pchar together with Image Transformations
https://ucarecdn.com/85b5644f-e692-4855-9db0-8c5a83096e25/-/preview/-/resize/550x/image@1x.jpg

// using a sub-delim allowed in pchar together with Image Transformations
https://ucarecdn.com/85b5644f-e692-4855-9db0-8c5a83096e25/-/preview/-/grayscale/image_black&white@2x.jpg

// using percent-encoded gen-delims that are not allowed in pchar
https://ucarecdn.com/85b5644f-e692-4855-9db0-8c5a83096e25/-/preview/-/grayscale/image%5Bdesaturated%5D@2x.jpg

Unsafe:

// using gen-delims that are not allowed in pchar without encoding
https://ucarecdn.com/85b5644f-e692-4855-9db0-8c5a83096e25/-/preview/-/grayscale/image[desaturated]@2x.jpg
File with a custom name
You can set an optional filename that users will see instead of the original name.

path Parameters
uuid
required
string
Example: d7fe74ac-65b8-4ade-875f-ccd92759a70f
Unique file identifier

filename
required
string
Example: cat.jpg
An optional filename that users will see instead of the original name.

Responses
200
File with a custom name

404
Image with "File not found" text.


get
/{uuid}/{filename}

File groups
Groups are file collections. Use them to organize content in your Uploadcare project. A common use case is to use them in the single content upload or delivery transactions.

For instance, you can create groups when you upload multiple files. For the new uploader this option is turned off by default. For jQuery widget, a new group is automatically created.

When it's turned on, it stores UUIDs of uploaded files. You can access file collections via :group_uuid:

https://ucarecdn.com/cd334b26-c641-4393-bcce-b5041546430d~11/
:group_uuid is similar to a single file UUID, but it has the file number ~N at the end. A group can contain up to 1000 files.

A group URL will show a list of individual file URLs with their UUIDs, and index numbers in that group.

Learn more about creating and managing groups.

Accessing single files in a group
Request a specific file in a group by adding /nth/i/, where i is a file index, starting from 0:

/:group_uuid/nth/0/
/:group_uuid/nth/1/
/:group_uuid/nth/2/
Note, there is no /-/ separator after a group UUID. It's required for transformations only.

By the way, you can apply image transformations to the indivitual files within a group:

/:group_uuid/nth/0/-/resize/256x/
You can also group the processed files with the respective operation sequences. When you request a file by its group URL, it'll include all operations before adding it to that group. Adding more operations after /-/ will apply them over the existing ones.

Get a group as an archive
Getting a group as an archive is done via the archive group processing operation.

The operation limits are:

A total size of uncompressed files ≤ 2 GB.
Processing operations will be discarded. Only original files will be archived.
Here's how to get an archived file group:

/:group_uuid/archive/:format/:filename
:group_uuid — UUID of a file group you want to get as an archive.
:format — the format of that output archive, we support zip and tar.
:filename (optional) — output archive filename.
Note: If the group contains a removed file, the archive operation will fail with a 404 error code.

Image processing limitations
With Uploadcare, you can easily build custom image transformation workflows and automate most image manipulation and optimization tasks. For example, you can set up a chain of actions for user-generated images that'll unify their look.

Every URL image operation generates a modified image version on the fly, while the original file stays intact. The transformed image version will be cached on CDN nodes to optimize delivery.

Input image formats
List of supported image formats:

AVIF
BMP
GIF
HEIC
JPEG
PCX
PNG
TGA
TIFF
WEBP
Some formats have several variations, and we support the most popular ones. Contact sales if you require additional formats or variations.

Without any image processing operation in the URL, CDN instructs browsers to show images (Content-Disposition: inline) and download other file types (Content-Disposition: attachment). Browsers may not show all image formats, for example, TIFF and HEIC format. If you need to display an image, add any image processing operation, -/preview/ for instance. The inline control allows you to change this behavior.

-/inline/yes/
-/inline/no/
Core operations
When processing images, add at least one of the following operations via their respective URL directives:

resize
smart_resize
scale_crop
preview
Output image dimensions
The dimensions you specify for the last operation should not exceed 3000x3000 pixels. You can go up to 5000x5000 pixels by explicitly setting your image format to JPEG, cdn›/format/jpeg/.

You can extend the output max resolution up to 8192x8192, and up to 16384x16384 for JPEGs in trade-off for increased latency. Contact sales to learn more about this option.

SVG files
Any image transformation CDN URL is valid with an SVG file. Most operations don't affect the response SVG body, while geometric operations (crop, preview, resize, scale_crop) change SVG attributes and work as expected.

To apply full range of operations on SVG file, it should be rasterized by applying -/rasterize/ operation.

Note: Operation is safe to apply to any image. Not SVG images won't be affected by this operation.

SVGs uploaded before May 26, 2021 still have is_image: false and adding processing operations to them will result in error. Contact support to batch process previously uploaded files.

Image resolution
We don’t provide on-the-fly image processing for images greater than 75 Mpx in resolution: those are tagged as non-image files and can only be delivered via CDN as-is. Adding processing operations to non-image files will result in an error.

Simple rotation
When the only image transformation you want is rotating, consider using the preview control without any arguments. When you use any of the transformations, we automatically rotate images according to their EXIF orientation.

Animated images
Animated images are treated as static by the transformations engine, consider checking out our GIF to Video workflow optimized for animated images delivery.

REST API image processing
Most image processing operations work on-the-fly, except some that must be called via REST API:

Background removal
Object recognition
Video and document thumbnail generation
Image compression
Operation	Syntax
Format	-/format/:format/
Quality	-/quality/:value/
Progressive JPEG	-/progressive/yes/ -/progressive/no/
Meta information control	-/strip_meta/all/ -/strip_meta/none/ -/strip_meta/sensitive/
Animated image to video	/gif2video/ -/format/:value/ -/quality/:value/ -/preview/ -/preview/:dimensions/ -/resize/:one_or_two_dimensions/ -/crop/:dimensions/ -/crop/:dimensions/:alignment/ -/scale_crop/:dimensions/ -/scale_crop/:dimensions/:alignment/
Image resize and crop
Operation	Syntax
Preview	-/preview/:dimensions/
Resize	-/resize/:one_or_two_dimensions/
Smart resize	-/smart_resize/:dimensions/
Crop	-/crop/:dimensions/ -/crop/:dimensions/:alignment/
Crop by ratio	-/crop/:ratio/ -/crop/:ratio/:alignment/
Crop by objects	-/crop/:tag/ -/crop/:tag/:ratio/ -/crop/:tag/:ratio/:alignment/ -/crop/:tag/:dimensions/ -/crop/:tag/:dimensions/:alignment/
Scale crop	-/scale_crop/:dimensions/ -/scale_crop/:dimensions/:alignment/
Smart crop	-/scale_crop/:dimensions/:type/ -/scale_crop/:dimensions/:type/:alignment/
Crop solid background	-/trim/ -/trim/:tolerance/:padding/
Border radius and circle crop	-/border_radius/:radii/ -/border_radius/:radii/:vertical_radii/
Set fill color	-/setfill/:color/
Zoom objects	-/zoom_objects/:zoom/
Image rotation
Operation	Syntax
Automatic rotation, EXIF-based	-/autorotate/yes/ -/autorotate/no/
Manual rotation	-/rotate/:angle/
Flip	-/flip/
Mirror	-/mirror/
Image overlays
Operation	Syntax
Image overlay	-/overlay/:uuid/ -/overlay/:uuid/:rel_dimensions/:rel_coords/:opacity/
Self overlay	-/overlay/self/ -/overlay/self/:rel_dimensions/:rel_coords/:opacity/
Text overlay	-/text/:rel_dimensions/:rel_coords/:text/
Color overlay	-/rect/:color/:relative_dimensions/:relative_coordinates/
Image colors
Operation	Syntax
Basic color adjustment	-/brightness/:value/ -/exposure/:value/ -/gamma/:value/ -/contrast/:value/ -/saturation/:value/ -/vibrance/:value/ -/warmth/:value/
Enhance	-/enhance/ -/enhance/:strength/
Grayscale	-/grayscale/
Inverting	-/invert/
Conversion to sRGB	-/srgb/fast/ -/srgb/icc/ -/srgb/keep_profile/
ICC profile size threshold	-/max_icc_size/0/ -/max_icc_size/:number/
Photo filters	-/filter/:name/ -/filter/:name/:amount/
Image definition
Operation	Syntax
Blur	-/blur/ -/blur/:strength/
Blur region	-/blur_region/:two_dimensions/:two_coords/ -/blur_region/:two_dimensions/:two_coords/:strength/
Blur faces	-/blur_region/faces/ -/blur_region/faces/:strength/
Unsharp masking	-/blur/:strength/:amount/
Sharpen	-/sharp/ -/sharp/:strength/
Image recognition
Operation	Syntax
Face detection	/detect_faces/
Color recognition)	-/main_colors/:number_of_colors/
Other image operations
Operation	Syntax
Rasterization	-/rasterize/
Inline	-/inline/
Proxy
In addition to faster page load and a better uptime in case some servers become inaccessable, Uploadcare CDN features on-the-fly image processing features and can work as a proxy.

Signed URLs
Control who and for how long can access files in your project via signed URLs. A signed URL is a URL that contains authentication information in its query string that provides limited permission and time to get the file. Learn more how to start using signed URLs.

CDN settings
You can change various CDN settings or the entire CDN provider. Learn more about our CDN settings.

Integrations
You don't have to code most of the low-level API interactions. We have high-level libraries for all popular platforms.

Other APIs
You can find the complete reference documentation for the Upload API here and the REST API here.