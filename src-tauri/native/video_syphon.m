// Narrow adapter to the public Syphon Metal API. The framework is loaded from
// the application bundle, never from a system search path.
#import <Foundation/Foundation.h>
#import <Metal/Metal.h>
#include <stdatomic.h>

@interface NSObject (AVSyphonAPI)
+ (id)sharedDirectory;
- (NSArray *)servers;
- (id)initWithName:(NSString *)name device:(id<MTLDevice>)device options:(NSDictionary *)options;
- (id)initWithServerDescription:(NSDictionary *)description device:(id<MTLDevice>)device options:(NSDictionary *)options newFrameHandler:(void (^)(id))handler;
- (void)publishFrameTexture:(id<MTLTexture>)texture onCommandBuffer:(id<MTLCommandBuffer>)buffer imageRegion:(NSRect)region flipped:(BOOL)flipped;
- (id<MTLTexture>)newFrameImage;
- (NSDictionary *)serverDescription;
- (BOOL)hasClients;
- (void)stop;
@end

static NSString * const UUIDKey = @"SyphonServerDescriptionUUIDKey";
static NSString * const NameKey = @"SyphonServerDescriptionNameKey";
static NSString * const AppKey = @"SyphonServerDescriptionAppNameKey";

static void onMain(dispatch_block_t block) {
    if (NSThread.isMainThread) block(); else dispatch_sync(dispatch_get_main_queue(), block);
}

bool av_syphon_load(const char *path) {
    __block BOOL ready = NO;
    onMain(^{ @autoreleasepool {
        NSBundle *bundle = [NSBundle bundleWithPath:[NSString stringWithUTF8String:path]];
        ready = [bundle load] && NSClassFromString(@"SyphonMetalServer") && NSClassFromString(@"SyphonMetalClient");
        if (ready) [NSClassFromString(@"SyphonServerDirectory") sharedDirectory];
    }});
    return ready;
}

char *av_syphon_sources(void) {
    __block NSData *json;
    onMain(^{ @autoreleasepool {
        NSMutableArray *entries = [NSMutableArray array];
        for (NSDictionary *server in [[NSClassFromString(@"SyphonServerDirectory") sharedDirectory] servers]) {
            NSString *uuid = server[UUIDKey];
            if (!uuid.length) continue;
            [entries addObject:@{ @"id": uuid, @"name": server[NameKey] ?: @"Untitled", @"app": server[AppKey] ?: @"Syphon" }];
            if (entries.count >= 512) break;
        }
        json = [NSJSONSerialization dataWithJSONObject:entries options:0 error:nil];
    }});
    if (!json) return strdup("[]");
    char *result = malloc(json.length + 1);
    if (!result) return NULL;
    memcpy(result, json.bytes, json.length); result[json.length] = 0; return result;
}
void av_syphon_free_string(char *text) { free(text); }

@interface AVSyphonSender : NSObject
@property(nonatomic, strong) id server;
@property(nonatomic, strong) id<MTLCommandQueue> queue;
@end
@implementation AVSyphonSender
- (void)dealloc { [_server stop]; }
@end

void *av_syphon_sender_create(const char *name, void *devicePtr) {
    @autoreleasepool {
        id<MTLDevice> device = (__bridge id<MTLDevice>)devicePtr;
        AVSyphonSender *sender = [AVSyphonSender new];
        sender.queue = [device newCommandQueue];
        sender.server = [[NSClassFromString(@"SyphonMetalServer") alloc] initWithName:[NSString stringWithUTF8String:name] device:device options:nil];
        if (!sender.server || !sender.queue) return NULL;
        return (__bridge_retained void *)sender;
    }
}
char *av_syphon_sender_id(void *senderPtr) {
    @autoreleasepool { AVSyphonSender *sender = (__bridge AVSyphonSender *)senderPtr;
        return strdup([(NSString *)[sender.server serverDescription][UUIDKey] UTF8String] ?: ""); }
}
typedef void (*AVCompletion)(void *);
// The caller schedules this only after wgpu has finished filling a retained
// export texture. Completion releases that ring slot after Syphon's GPU copy.
void av_syphon_publish(void *senderPtr, void *texturePtr, AVCompletion completed, void *context) {
    @autoreleasepool {
        AVSyphonSender *sender = (__bridge AVSyphonSender *)senderPtr;
        id<MTLTexture> texture = (__bridge id<MTLTexture>)texturePtr;
        id<MTLCommandBuffer> buffer = [sender.queue commandBuffer];
        if (!buffer || !texture) { completed(context); return; }
        [sender.server publishFrameTexture:texture onCommandBuffer:buffer imageRegion:NSMakeRect(0, 0, texture.width, texture.height) flipped:NO];
        [buffer addCompletedHandler:^(id<MTLCommandBuffer> finished) { (void)finished; completed(context); }];
        [buffer commit];
    }
}

@interface AVSyphonReceiver : NSObject { @public atomic_uint_fast64_t sequence; }
@property(nonatomic, strong) id client;
@end
@implementation AVSyphonReceiver
- (void)dealloc { [_client stop]; }
@end

void *av_syphon_receiver_create(const char *uuid, void *devicePtr) {
    __block AVSyphonReceiver *receiver;
    onMain(^{ @autoreleasepool {
        NSString *identifier = [NSString stringWithUTF8String:uuid];
        for (NSDictionary *server in [[NSClassFromString(@"SyphonServerDirectory") sharedDirectory] servers]) {
            if (![server[UUIDKey] isEqualToString:identifier]) continue;
            receiver = [AVSyphonReceiver new];
            atomic_init(&receiver->sequence, 0);
            __weak AVSyphonReceiver *weakReceiver = receiver;
            receiver.client = [[NSClassFromString(@"SyphonMetalClient") alloc] initWithServerDescription:server device:(__bridge id<MTLDevice>)devicePtr options:nil newFrameHandler:^(id client) {
                (void)client; AVSyphonReceiver *current = weakReceiver;
                if (current) atomic_fetch_add_explicit(&current->sequence, 1, memory_order_release);
            }];
            break;
        }
    }});
    if (!receiver.client) return NULL;
    return (__bridge_retained void *)receiver;
}

void *av_syphon_receive(void *receiverPtr, uint64_t after, uint64_t *sequence, uint32_t *width, uint32_t *height, uint32_t *format) {
    @autoreleasepool {
        AVSyphonReceiver *receiver = (__bridge AVSyphonReceiver *)receiverPtr;
        uint64_t latest = atomic_load_explicit(&receiver->sequence, memory_order_acquire);
        if (latest == after) return NULL;
        id<MTLTexture> texture = [receiver.client newFrameImage];
        if (!texture) return NULL;
        *sequence = latest; *width = (uint32_t)texture.width; *height = (uint32_t)texture.height; *format = (uint32_t)texture.pixelFormat;
        return (__bridge_retained void *)texture;
    }
}
void av_syphon_release(void *object) { if (object) { @autoreleasepool { id released = CFBridgingRelease(object); (void)released; } } }
