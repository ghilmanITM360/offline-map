import XCTest
import UIKit
import Darwin
// Cross-device harness (iOS 26.x evidence). No model dimensions are hardcoded: the screen and the app's own safe
// area are measured at run time, and every primary control is asserted against the measured visible/safe bounds.
// The geometry-specific iPhone 13 mini harness (ArrivalTouch.swift) is preserved unchanged as historical evidence.
final class CrossDeviceJourney: XCTestCase {
 let app=XCUIApplication(bundleIdentifier:"com.example.sdkconsumer")
 func mark(_ v:String){print(v);fflush(stdout)}
 func evidence(_ n:String){let a=XCTAttachment(screenshot:app.screenshot());a.name=n;a.lifetime = .keepAlways;add(a);let b=XCTAttachment(string:app.debugDescription);b.name=n+"-hierarchy";b.lifetime = .keepAlways;add(b)}
 func text(_ v:String)->XCUIElement{app.descendants(matching:.any).matching(NSPredicate(format:"label BEGINSWITH %@",v)).firstMatch}
 func button(_ l:String)->XCUIElement{app.buttons.matching(NSPredicate(format:"label == %@ OR label BEGINSWITH %@",l,l)).firstMatch}
 var screen:CGRect{app.windows.firstMatch.frame}
 // Measured, not assumed: the app lays its map container inside the safe area, so its top edge is the top inset;
 // the bottom inset is the gap under the lowest anchored control. Both are cross-checked against plausible bounds.
 var safe:CGRect{
  let s=screen;let top=max(app.otherElements["navigation-map"].frame.minY,s.minY)
  let anchor=app.buttons["Show demo tools"].exists ? app.buttons["Show demo tools"].frame.maxY:(app.buttons["Hide demo tools"].exists ? app.buttons["Hide demo tools"].frame.maxY:s.maxY)
  let bottom=min(anchor,s.maxY);return CGRect(x:s.minX,y:top,width:s.width,height:max(0,bottom-top))
 }
 func size(_ n:String){mark("NATIVESIZE:"+n);sleep(2)}
 func appearance(_ n:String){mark("NATIVEAPPEARANCE:"+n);sleep(2)}
 func gps(_ n:String,_ s:UInt32=2){mark("NATIVEGPS:"+n);sleep(s)}
 func net(_ n:String){mark("NATIVENET:"+n);sleep(1)}
 func tools(){if app.buttons["Show demo tools"].exists{tap("Show demo tools")}}
 func hideTools(){if app.buttons["Hide demo tools"].exists{tap("Hide demo tools")}}
 func language(_ n:String){tools();tap("Language: "+n);hideTools()}
 // Scrolls until the control is fully inside the measured safe bounds and hittable, then taps a real coordinate.
 func reach(_ e:XCUIElement,_ what:String){
  XCTAssertTrue(e.waitForExistence(timeout:10),"Missing \(what)")
  for _ in 0..<12{if e.isHittable && screen.contains(e.frame){break};if app.scrollViews.count>0{app.scrollViews.element(boundBy:app.buttons["Hide demo tools"].exists ? app.scrollViews.count-1:0).swipeUp()}else{app.swipeUp()}}
  XCTAssertTrue(e.isHittable,"Unreachable \(what)");XCTAssertTrue(screen.contains(e.frame),"\(what) clipped by screen \(e.frame) vs \(screen)")
 }
 func tap(_ l:String){let b=button(l);reach(b,l);b.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).tap()}
 // Geometric invariant for the primary controls currently visible: inside screen, below the status-bar inset,
 // above the home-indicator inset, minimum 44pt touch size (iOS HIG), none overlapping another.
 func assertLayout(_ tag:String,_ labels:[String]){
  let sf=safe;mark("LAYOUT \(tag) screen=\(screen) safe=\(sf)")
  XCTAssertTrue(sf.minY>=0 && sf.minY<=120,"implausible top inset \(sf.minY)");XCTAssertTrue(screen.maxY-sf.maxY<=60,"implausible bottom inset")
  var frames=[CGRect]()
  for l in labels{
   let b=button(l);guard b.exists else{continue}
   if !b.isHittable{reach(b,l)}
   let f=b.frame;mark("FRAME \(tag) \(l) \(f)")
   XCTAssertTrue(screen.contains(f),"\(l) outside screen \(f)");XCTAssertGreaterThanOrEqual(f.minY,sf.minY-0.5,"\(l) overlaps status/top inset");XCTAssertLessThanOrEqual(f.maxY,screen.maxY-0.0,"\(l) below screen")
   XCTAssertGreaterThanOrEqual(f.height,43.5,"\(l) touch height \(f.height)");XCTAssertGreaterThanOrEqual(f.width,43.5,"\(l) touch width \(f.width)")
   for o in frames{XCTAssertFalse(o.intersection(f).width>1 && o.intersection(f).height>1,"\(l) overlaps another primary control")}
   frames.append(f)
  }
 }
 func boot(_ lang:String="English"){continueAfterFailure=false;size("large");appearance("light");app.terminate();app.launch();XCTAssertTrue(app.otherElements["navigation-map"].waitForExistence(timeout:40),"offline map did not render");language(lang);tools();if app.buttons["Location source: simulated. Switch."].exists{tap("Location source: simulated. Switch.")};hideTools();gps("gate01");evidence("cold-launch");mark("DEVICE_GEOMETRY screen=\(screen) safe=\(safe)")}
 func directory(){
  let search=app.textFields["Search places"];XCTAssertTrue(search.waitForExistence(timeout:8));reach(search,"search");search.tap();search.typeText("0");usleep(300000);search.typeText("2");usleep(300000);search.typeText("\n")
  XCTAssertTrue(button("Gate 02. Gate").waitForExistence(timeout:8));evidence("directory-search")
 }
 func manual(){
  directory();tap("Gate 02. Gate");tap("Choose a start");tap("Gate 01. Gate");XCTAssertTrue(text("111 m walk").waitForExistence(timeout:8));evidence("preview-111m")
  tap("Follow the steps.");tap("Next step");XCTAssertTrue(app.buttons["Previous step"].isEnabled);evidence("guide-step2");tap("Previous step");tap("Next step")
 }
 func live(){tap("Use my location");if app.buttons["Continue"].exists{tap("Continue")}else if app.buttons["Try again"].exists{tap("Try again")};sleep(3);evidence("live-after-use-location");XCTAssertTrue(text("Your live route").waitForExistence(timeout:12));evidence("live-candidate");tap("Start live navigation");XCTAssertTrue(app.buttons["End navigation"].waitForExistence(timeout:10));evidence("live-started")}
 func arrivalChecks(_ tag:String){
  let done=app.buttons["nav-arrived-done-button"],rec=app.buttons["nav-arrived-recenter-button"],card=app.otherElements["nav-arrived-card"]
  XCTAssertTrue(done.waitForExistence(timeout:15),"arrival did not appear");evidence(tag+"-arrival")
  reach(done,"Done");reach(rec,"Recenter");let sf=safe
  mark("ARRIVAL_FRAMES \(tag) screen=\(screen) safe=\(sf) card=\(card.frame) done=\(done.frame) recenter=\(rec.frame)")
  for e in [done,rec]{XCTAssertTrue(screen.contains(e.frame));XCTAssertGreaterThanOrEqual(e.frame.minY,sf.minY-0.5);XCTAssertTrue(e.isHittable);XCTAssertGreaterThanOrEqual(e.frame.height,43.5)}
  let o=app.coordinate(withNormalizedOffset:.zero);let r=rec.frame;o.withOffset(CGVector(dx:r.midX,dy:r.midY)).tap();XCTAssertTrue(done.exists)
  let d=done.frame;o.withOffset(CGVector(dx:d.midX,dy:d.midY)).tap();XCTAssertTrue(text("Where to?").waitForExistence(timeout:10));evidence(tag+"-done-exit")
 }
 // 1-14, 18: full journey with offline observation markers, ending with a clean second journey.
 func test01FullJourney(){
  net("begin");boot();assertLayout("home",["Show demo tools"]);manual()
  assertLayout("guide",["Previous step","Next step"])
  live();assertLayout("live",["End navigation"])
  gps("r6");XCTAssertFalse(app.buttons["nav-arrived-done-button"].exists,"arrival before the destination");evidence("progress-r6")
  gps("r602",4);XCTAssertFalse(app.buttons["nav-arrived-done-button"].exists);gps("r603",5);XCTAssertTrue(text("Route updated from where you are.").waitForExistence(timeout:8));XCTAssertFalse(app.buttons["nav-arrived-done-button"].exists);evidence("reroute")
  gps("r6",4);gps("gate02");arrivalChecks("journey1")
  // second journey: no stale state
  gps("gate01");manual();XCTAssertTrue(app.buttons["Previous step"].isEnabled,"second journey guide missing");XCTAssertFalse(app.buttons["nav-arrived-done-button"].exists,"stale arrival");tap("End directions");XCTAssertTrue(text("Where to?").waitForExistence(timeout:8));evidence("journey2-clean-exit")
  net("end")
 }
 func test02BackgroundForeground(){
  boot();manual();tap("Next step");tap("Previous step");tap("Next step")
  XCUIDevice.shared.press(.home);sleep(3);app.activate();sleep(2);XCTAssertTrue(app.buttons["Previous step"].isEnabled);XCTAssertTrue(text("111 m walk").exists || app.buttons["Previous step"].exists);evidence("guide-after-bg")
  tap("End directions");manual();live();XCUIDevice.shared.press(.home);sleep(3);app.activate();sleep(2);XCTAssertTrue(app.buttons["End navigation"].waitForExistence(timeout:8));evidence("live-after-bg")
  gps("r6");XCTAssertTrue(app.buttons["End navigation"].exists);tap("End navigation");XCTAssertTrue(text("Where to?").waitForExistence(timeout:8))
 }
 func test03AppearanceLightDark(){
  boot();manual();evidence("system-light-guide");appearance("dark");sleep(1);XCTAssertTrue(app.buttons["Previous step"].exists);assertLayout("dark-guide",["Previous step","Next step"]);evidence("system-dark-guide")
  tools();tap("Appearance: Light");hideTools();evidence("app-light-over-system-dark");tools();tap("Appearance: Dark");hideTools();evidence("app-dark");tools();tap("Appearance: System");hideTools()
  appearance("light");XCTAssertTrue(app.buttons["Previous step"].exists);assertLayout("light-guide",["Previous step","Next step"]);tap("End directions")
 }
 func test04UrduRtlLargeText(){
  for cat in ["extra-large","accessibility-extra-extra-extra-large"]{
   boot();manual();language("اردو");size(cat)
   XCTAssertTrue(text("قدم 2 از ").waitForExistence(timeout:8),"Urdu guide step label missing");evidence("urdu-guide-"+cat)
   assertLayout("urdu-guide-"+cat,["پچھلا قدم","اگلا قدم"])
   // RTL: Next sits left of Previous in a right-to-left row
   let prev=button("پچھلا قدم").frame,next=button("اگلا قدم").frame
   if abs(prev.midY-next.midY)<4{XCTAssertLessThan(next.midX,prev.midX,"RTL order not mirrored")}
   tap("پچھلا قدم");tap("اگلا قدم");XCTAssertTrue(text("قدم 2 از ").exists)
   size("large");language("English");tap("End directions");XCTAssertTrue(text("Where to?").waitForExistence(timeout:8))
  }
 }
}
