import XCTest
import UIKit
import Darwin
final class ArrivalTouch: XCTestCase {
 let app=XCUIApplication(bundleIdentifier:"com.example.sdkconsumer")
 func mark(_ value:String) {print(value);fflush(stdout)}
 func evidence(_ name:String) {let a=XCTAttachment(screenshot:app.screenshot());a.name=name;a.lifetime = .keepAlways;add(a);let b=XCTAttachment(string:app.debugDescription);b.name=name+"-hierarchy";b.lifetime = .keepAlways;add(b)}
 func text(_ value:String)->XCUIElement {app.descendants(matching:.any).matching(NSPredicate(format:"label BEGINSWITH %@",value)).firstMatch}
 func tap(_ label:String) {
  let b=app.buttons.matching(NSPredicate(format:"label == %@ OR label BEGINSWITH %@",label,label)).firstMatch
  XCTAssertTrue(b.waitForExistence(timeout:10),"Missing \(label)")
  for _ in 0..<10 {if b.isHittable {break};if app.scrollViews.count>0 {app.scrollViews.element(boundBy:app.buttons["Hide demo tools"].exists ? app.scrollViews.count-1:0).swipeUp()}else{app.swipeUp()}}
  XCTAssertTrue(b.isHittable,"Unreachable \(label)");b.tap()
 }
 func size(_ name:String) {mark("NATIVESIZE:"+name);sleep(2)}
 func gps(_ name:String,_ seconds:UInt32=2) {mark("NATIVEGPS:"+name);sleep(seconds)}
 func tools() {if app.buttons["Show demo tools"].exists {tap("Show demo tools")}}
 func hideTools(){if app.buttons["Hide demo tools"].exists {tap("Hide demo tools")}}
 func language(_ name:String){tools();tap("Language: "+name);hideTools()}
 func boot(){continueAfterFailure=false;size("large");app.terminate();app.launch();language("English");tools();if app.buttons["Location source: simulated. Switch."].exists {tap("Location source: simulated. Switch.")};hideTools();gps("gate01");let bounds=app.frame;let top=app.otherElements["navigation-map"].frame.minY;let bottom=bounds.maxY-app.buttons["Show demo tools"].frame.maxY;mark("MEASURED_SAFE_AREA screen=\(bounds) top=\(top) bottom=\(bottom)");XCTAssertEqual(top,50,accuracy:0.5);XCTAssertEqual(bottom,34,accuracy:0.5);evidence("launch-device-adapter")}
 func manual(){
  let search=app.textFields["Search places"];XCTAssertTrue(search.waitForExistence(timeout:8));search.tap();search.typeText("0");usleep(300000);search.typeText("2");usleep(300000);search.typeText("\n")
  tap("Gate 02. Gate");tap("Choose a start");tap("Gate 01. Gate");XCTAssertTrue(text("111 m walk").waitForExistence(timeout:5));evidence("preview-111m")
  tap("Follow the steps.");tap("Next step");evidence("guide-native-step-label");XCTAssertTrue(app.buttons["Previous step"].isEnabled);tap("Previous step");tap("Next step");evidence("guide-step2")
 }
 func continueAttempt(){if app.buttons["Continue"].exists {tap("Continue")} else {tap("Try again")}}
 func live(){tap("Use my location");continueAttempt();XCTAssertTrue(text("Your live route").waitForExistence(timeout:10));evidence("native-candidate");tap("Start live navigation");XCTAssertTrue(app.buttons["End navigation"].waitForExistence(timeout:8));evidence("native-live")}
 func arrivalTouch(_ variant:String){
  let screen=app.frame;XCTAssertEqual(screen.width,375,accuracy:0.5);XCTAssertEqual(screen.height,812,accuracy:0.5)
  let safe=CGRect(x:0,y:50,width:375,height:728),done=app.buttons["nav-arrived-done-button"],recenter=app.buttons["nav-arrived-recenter-button"],scroll=app.scrollViews.firstMatch,card=app.otherElements["nav-arrived-card"]
  XCTAssertTrue(done.waitForExistence(timeout:12));evidence(variant+"-before-scroll")
  for _ in 0..<12 {if safe.contains(done.frame) && safe.contains(recenter.frame) && scroll.frame.insetBy(dx:-0.01,dy:-0.01).contains(done.frame) && scroll.frame.insetBy(dx:-0.01,dy:-0.01).contains(recenter.frame) && done.isHittable && recenter.isHittable {break};scroll.swipeUp(velocity:.slow)}
  mark("FRAMES \(variant) screen=\(screen) safe=\(safe) card=\(card.frame) scroll=\(scroll.frame) done=\(done.frame) recenter=\(recenter.frame)")
  XCTAssertTrue(screen.contains(card.frame));XCTAssertTrue(card.frame.insetBy(dx:-0.01,dy:-0.01).contains(scroll.frame))
  for e in [done,recenter] {XCTAssertTrue(safe.contains(e.frame),"unsafe \(e.frame)");XCTAssertTrue(scroll.frame.insetBy(dx:-0.01,dy:-0.01).contains(e.frame),"clipped \(e.frame)");XCTAssertTrue(e.isHittable)}
  evidence(variant+"-fully-visible")
  let origin=app.coordinate(withNormalizedOffset:.zero),r=recenter.frame
  origin.withOffset(CGVector(dx:r.midX,dy:r.midY)).tap();XCTAssertTrue(done.exists)
  let d=done.frame;origin.withOffset(CGVector(dx:d.midX,dy:d.midY)).tap();XCTAssertTrue(text("Where to?").waitForExistence(timeout:8));evidence(variant+"-touch-exit")
  size("large");language("English");manual();tap("End directions");XCTAssertTrue(text("Where to?").waitForExistence(timeout:8));evidence(variant+"-next-journey-exit")
 }
 func journey(_ category:String,_ urdu:Bool){boot();manual();live();gps("r6");XCTAssertFalse(app.buttons["nav-arrived-done-button"].exists);evidence("native-progress");if urdu {language("اردو")};gps("gate02");XCTAssertTrue(app.buttons["nav-arrived-done-button"].waitForExistence(timeout:12));size(category);arrivalTouch((urdu ? "urdu-":"english-")+category)}
 func test01Normal(){journey("large",false)}
 func test02ExtraLarge(){journey("extra-large",false)}
 func test03AX5(){journey("accessibility-extra-extra-extra-large",false)}
 func test04UrduExtraLarge(){journey("extra-large",true)}
 func test05UrduAX5(){journey("accessibility-extra-extra-extra-large",true)}
 func test06UrduDynamicType(){
  boot();manual();language("اردو")
  var frames=[CGRect]()
  for category in ["extra-large","large","accessibility-extra-extra-extra-large","large","extra-large","large","extra-large"] {
   size(category);XCTAssertTrue(text("قدم 2 از ").exists);let prev=app.buttons["پچھلا قدم"];XCTAssertTrue(prev.isEnabled);frames.append(prev.frame);evidence("urdu-guide2-"+category)
   tap("پچھلا قدم");tap("اگلا قدم");XCTAssertTrue(text("قدم 2 از ").exists)
  }
  tools();tap("Appearance: Dark");hideTools();XCTAssertTrue(text("قدم 2 از ").exists);evidence("urdu-unrelated-dark-commit")
  tools();tap("Appearance: System");hideTools();tap("پچھلا قدم");tap("اگلا قدم");XCTAssertTrue(text("قدم 2 از ").exists);mark("URDU_CONTROL_FRAMES \(frames)")
  size("large");language("English");tap("End directions")
 }
 func test07NativeRecoveryReroute(){
  boot();manual();live();gps("pause",11);XCTAssertTrue(text("GPS signal lost. Progress is paused until the signal returns.").waitForExistence(timeout:6));evidence("native-loss")
  gps("r6");XCTAssertTrue(app.buttons["End navigation"].exists);evidence("native-recovery")
  XCUIDevice.shared.press(.home);sleep(2);app.activate();sleep(2);XCTAssertTrue(app.buttons["End navigation"].exists);evidence("native-foreground")
  gps("r602",4);XCTAssertFalse(app.buttons["nav-arrived-done-button"].exists);gps("r603",5);evidence("native-offroute")
  XCTAssertTrue(text("Route updated from where you are.").waitForExistence(timeout:8));XCTAssertFalse(app.buttons["nav-arrived-done-button"].exists)
  tap("End navigation");XCTAssertTrue(text("Where to?").waitForExistence(timeout:8));gps("gate02");XCTAssertTrue(text("Where to?").exists);evidence("native-exit-late-fix")
 }
 func test08NativePackLab(){boot();tools();tap("Run pack self-test");XCTAssertTrue(text("Self-test: 10 of 10 passed").waitForExistence(timeout:30));evidence("native-pack-10of10");hideTools()}
 func test09PermissionDenialRecovery(){
 boot();manual();mark("NATIVEPERM:deny");sleep(2);tap("Use my location");continueAttempt();sleep(2);evidence("native-permission-denied")
 XCTAssertTrue(text("Location access is turned off").exists || text("Location permission is needed").exists)
 tap("Not now");XCTAssertTrue(app.buttons["Previous step"].isEnabled)
 mark("NATIVEPERM:grant");sleep(2);gps("gate01");tap("Use my location");continueAttempt();XCTAssertTrue(text("Your live route").waitForExistence(timeout:12));evidence("native-permission-recovered-candidate")
 tap("Not now");XCTAssertTrue(app.buttons["Previous step"].isEnabled);tap("End directions")
 }
 func test10NativeAsyncCancellationReplacement(){
 boot();manual();gps("pause",11);tap("Use my location");continueAttempt();tap("Not now");tap("End directions");tap("Gate 03. Gate");gps("gate02");sleep(3)
 XCTAssertTrue(text("To Gate 03").exists);XCTAssertFalse(app.buttons["End navigation"].exists);XCTAssertFalse(app.buttons["nav-arrived-done-button"].exists);evidence("native-cancel-replace-late-fix")
 }
 func test11ReducedAccuracyRecovery(){
 boot();manual()
 let settings=XCUIApplication(bundleIdentifier:"com.apple.Preferences");settings.activate()
 for _ in 0..<8 {if settings.buttons["com.apple.settings.privacyAndSecurity"].exists {break};settings.navigationBars.buttons.element(boundBy:0).tap()}
 settings.buttons["com.apple.settings.privacyAndSecurity"].tap();settings.buttons["LOCATION"].tap()
 let consumer=settings.cells.matching(NSPredicate(format:"label BEGINSWITH 'SDK Consumer'")).firstMatch
 for _ in 0..<10 {if consumer.exists {break};settings.swipeUp()};XCTAssertTrue(consumer.exists);consumer.tap()
 mark("ACCURACY_SETTINGS "+settings.debugDescription)
 let precise=settings.switches["Precise Location"];XCTAssertTrue(precise.waitForExistence(timeout:5));XCTAssertEqual(precise.value as? String,"1");precise.tap()
 let reduced=XCTAttachment(screenshot:settings.screenshot());reduced.name="native-reduced-accuracy-setting";reduced.lifetime = .keepAlways;add(reduced)
 app.activate();tap("Use my location");continueAttempt();XCTAssertTrue(text("Live navigation needs precise location").waitForExistence(timeout:8));evidence("native-reduced-blocker")
 settings.activate();precise.tap();app.activate();tap("Not now");gps("gate01");tap("Use my location");continueAttempt();XCTAssertTrue(text("Your live route").waitForExistence(timeout:12));evidence("native-full-accuracy-recovered");tap("Not now");tap("End directions")
 }
}
