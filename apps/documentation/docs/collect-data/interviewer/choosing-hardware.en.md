---
title: Choosing a Hardware Device for Interviewer
navOrder: 3
wip: false
toc: true
---

Choosing a device for running Interviewer is an important step in optimizing the quality of the data that you collect, as well as the overall workflow of running a Network Canvas study.

<TipBox>

The platform comparison below — along with the App Store availability and native-app management concerns — chiefly applies to **Interviewer Classic**, which you install natively on each device. The browser-based **Interviewer** runs in any [supported web browser](/en/collect-data/interviewer/about), so its main hardware requirement is a device that runs a current browser well. The display-quality, keyboard, performance, and connectivity advice on this page still applies, but you can disregard the app-store and native-install caveats.

</TipBox>

## Key Concerns

There are several important considerations you should keep in mind when making this decision.

The first is that **text entry is very burdensome without a physical keyboard**. When using a device without a physical keyboard (such as a tablet), the software keyboard that appears when entering text can take up more than 50% of the available screen. This leaves very little space for showing interface elements, or other data. Although features exist within the software to mitigate this (see our [article on configuring your interview device](/en/collect-data/interviewer/configuring-devices)), we still strongly recommend that you choose a device with a physical keyboard unless text entry is very minimal in your study.

The second is that you must **be mindful of your data management workflow**. How will you deploy your interview protocols (and how often will new versions be needed)? How will you get your data off of your interview devices? Different operating systems and platforms can make this process more or less difficult, and may require the use of third party tools (such as cloud providers).

The third is that **hardware performance is directly correlated with user experience**. Interviewer makes extensive use of animations and GPU intensive interactions. Using a device that has poor GPU performance will lead to stuttering and other side effects that may be perceived as unpleasant by participants, in turn leading to poorer quality data. Similarly, CPU performance will impact how long it takes to open roster interfaces which may make these functions more tedious to use.

The fourth is **connectivity**. If you plan to use **Interviewer** (beta) with internet-dependent schema-8 interfaces such as [Geospatial](/en/design-protocols/interface-documentation/geospatial), the interview device will need a reliable internet connection in the field. **Interviewer Classic**, and protocols that don't use such interfaces, run fully offline.

## Platform Comparison

### Android Tablet

✅ Widely available, including outside of the west/global north.  
✅ Can be very affordable.  
👎 Often have poor performance, and run old versions of Android.  
👎 Limited number of manufacturers of quality hardware (Samsung, and Huawei).  
👎 Tend to use very wide aspect ratio displays, which are not ideal for Interviewer.  
👎 Not generally capable of running other research software.  
👎 Can be difficult to import protocols and manage data.  
👎 Keyboard must be purchased separately.

### Chromebook

✅ Devices usually include both a touchscreen and a keyboard.  
✅ Can be very affordable, but can also be specified with more powerful hardware.  
✅ Portable form factor, similar to a laptop or tablet with keyboard.  
✅ Usually use the latest Android version.  
👎 Some models perform poorly when running Android apps.  
👎 Not all models support running Android apps.  
👎 Not generally capable of running other research software.

### iPad

✅ Extremely powerful in terms of GPU and CPU, with high quality displays.  
✅ Potentially more acceptable in certain settings.  
⛔️ **No longer generally available due to situation with Apple App Store Review.**  
👎 Can be difficult to import protocols and manage data.  
👎 Expensive! Keyboard must be purchased separately.

### Laptop

✅ Familiar environment for researchers and and participants.  
✅ Simple to manage protocols and interview data.  
✅ Able to run other general purpose software if required.  
✅ Easy to purchase through IT procurement processes.  
👎 Can be less portable and have poorer battery life.  
👎 Higher quality displays are more expensive.

## Overall Recommendation

For most of our users, the best overall option will be to run Interviewer on a **laptop with a touchscreen, from one of the big manufacturers** (Dell, HP, Lenovo, Acer, Asus).

Where these manufacturers offer different configurations, you should prioritize the quality of the display (look for displays that are as large, bright, and high resolution as possible), as well as GPU performance. Dedicated graphics will provide the best performance, but recent CPUs (such as Intel's 11th and 12th generation) provide powerful onboard graphics.
