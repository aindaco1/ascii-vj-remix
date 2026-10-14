// Independent public-SDK peer for installed-app video I/O acceptance on macOS.
// clang -fobjc-arc -F src-tauri/frameworks -framework Syphon -framework Metal \
//   -framework AppKit -Wl,-rpath,$PWD/src-tauri/frameworks syphon_probe.m -o /tmp/syphon-probe
#import <AppKit/AppKit.h>
#import <Metal/Metal.h>
#import <Syphon/Syphon.h>
#include <stdatomic.h>

int main(int argc, const char **argv) { @autoreleasepool {
    if (argc < 2) return 2;
    [NSApplication sharedApplication];
    id<MTLDevice> device=MTLCreateSystemDefaultDevice();
    id<MTLCommandQueue> queue=[device newCommandQueue];
    NSString *mode=@(argv[1]), *name=argc>2 ? @(argv[2]) : @"ASCII VJ Remix";
    NSTimeInterval seconds=argc>3 ? atof(argv[3]) : 30;
    NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:seconds];
    if ([mode isEqualToString:@"send"]) {
        SyphonMetalServer *server=[[SyphonMetalServer alloc] initWithName:name device:device options:nil];
        MTLTextureDescriptor *desc=[MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatBGRA8Unorm width:640 height:360 mipmapped:NO];
        desc.storageMode=MTLStorageModeShared; desc.usage=MTLTextureUsageShaderRead;
        id<MTLTexture> texture=[device newTextureWithDescriptor:desc];
        NSMutableData *data=[NSMutableData dataWithLength:640*360*4];
        unsigned char *pixels=data.mutableBytes; int frame=0;
        while (deadline.timeIntervalSinceNow>0) { @autoreleasepool {
            for(int y=0;y<360;y++) for(int x=0;x<640;x++) {int i=(y*640+x)*4;
                pixels[i]=180; pixels[i+1]=(x+frame)%256; pixels[i+2]=80;
                pixels[i+3]=x<210 ? 0 : x<430 ? 128 : 255;
            }
            [texture replaceRegion:MTLRegionMake2D(0,0,640,360) mipmapLevel:0 withBytes:pixels bytesPerRow:640*4];
            id<MTLCommandBuffer> command=[queue commandBuffer];
            [server publishFrameTexture:texture onCommandBuffer:command imageRegion:NSMakeRect(0,0,640,360) flipped:NO];
            [command commit]; [command waitUntilCompleted]; frame++;
            [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1.0/60]];
        }}
        [server stop]; printf("PASS: Syphon sent %d frames with three alpha bands\n",frame); return 0;
    }
    SyphonServerDirectory *directory=[SyphonServerDirectory sharedDirectory];
    __block atomic_bool pending; atomic_init(&pending,false);
    SyphonMetalClient *client=nil; int frames=0; unsigned lo=255,hi=0; NSUInteger w=0,h=0;
    while(deadline.timeIntervalSinceNow>0) { @autoreleasepool {
        if(!client) for(NSDictionary *s in directory.servers) {
            if([s[SyphonServerDescriptionNameKey] containsString:name]) {
                client=[[SyphonMetalClient alloc] initWithServerDescription:s device:device options:nil newFrameHandler:^(SyphonMetalClient *c){atomic_store(&pending,true);}]; break;
            }
        }
        if(client && atomic_exchange(&pending,false)) {
            id<MTLTexture> texture=[client newFrameImage];
            if(texture){w=texture.width;h=texture.height;
                id<MTLBuffer> bytes=[device newBufferWithLength:w*h*4 options:MTLResourceStorageModeShared];
                id<MTLCommandBuffer> command=[queue commandBuffer];id<MTLBlitCommandEncoder> blit=[command blitCommandEncoder];
                [blit copyFromTexture:texture sourceSlice:0 sourceLevel:0 sourceOrigin:MTLOriginMake(0,0,0) sourceSize:MTLSizeMake(w,h,1) toBuffer:bytes destinationOffset:0 destinationBytesPerRow:w*4 destinationBytesPerImage:w*h*4];
                [blit endEncoding];[command commit];[command waitUntilCompleted];
                unsigned char *p=bytes.contents; for(NSUInteger i=3;i<w*h*4;i+=4){lo=MIN(lo,p[i]);hi=MAX(hi,p[i]);}
                if(++frames>=120){[client stop];printf("PASS: Syphon received %d frames %lux%lu alpha=%u..%u\n",frames,w,h,lo,hi);return 0;}
            }
        }
        [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.005]];
    }}
    [client stop];fprintf(stderr,"FAIL: Syphon timeout after %d frames\n",frames);return 1;
}}
